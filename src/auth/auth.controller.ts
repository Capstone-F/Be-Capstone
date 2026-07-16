import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getAuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';
import { AppConfigService } from '../config/config.service';
import { LoginPostDto } from './dto/login-post.dto';
import { MobileOauthStateService } from './mobile-oauth-state.service';
import { MobileAuthCodeService } from './mobile-auth-code.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
    private readonly mobileOauthState: MobileOauthStateService,
    private readonly mobileAuthCode: MobileAuthCodeService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start login (SPA or mobile): return Keycloak login_uri',
    description:
      'Web: stores client_redirect_uri in the session cookie. ' +
      'Mobile (whitelisted deep link): stores OAuth state in Redis (no session). ' +
      'Returns login_uri for the browser / system browser. After OAuth, GET /auth/callback ' +
      'redirects to client_redirect_uri (web) or deep link with a one-time code (mobile).',
  })
  @ApiBody({ type: LoginPostDto })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        login_uri: {
          type: 'string',
          description: 'Keycloak authorization URL',
        },
      },
    },
  })
  async postLogin(@Body() body: LoginPostDto, @Req() req: Request) {
    const { uri: clientUri, flow } = this.authService.resolveClientRedirect(
      body?.client_redirect_uri,
    );
    const idpHint =
      typeof body?.idpHint === 'string' && body.idpHint.trim()
        ? body.idpHint.trim()
        : undefined;

    if (flow === 'mobile') {
      const state = await this.mobileOauthState.create(clientUri, idpHint);
      const { url } = this.authService.buildLoginUrl(idpHint, state);
      return { login_uri: url };
    }

    const { url, state } = this.authService.buildLoginUrl(idpHint);

    req.session.oauthState = state;
    req.session.clientRedirectUri = clientUri;
    if (idpHint) {
      req.session.idpHint = idpHint;
    }

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          this.logger.error(
            'Failed to save session before login response',
            err,
          );
          reject(
            new InternalServerErrorException('Failed to persist login session'),
          );
          return;
        }
        resolve();
      });
    });

    // Do not use @Res() + res.json() here: that bypasses Nest's response handling and
    // express-session often omits Set-Cookie on the outgoing response.
    return { login_uri: url };
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback (Keycloak redirects here)',
    description:
      'Keycloak redirects the browser here after authentication. ' +
      'Web: exchanges the code for tokens, stores them in the session, redirects to SPA. ' +
      'Mobile: exchanges the code, issues a one-time code, redirects to the deep link ' +
      '(never puts access/refresh tokens in the URL).',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const defaultFront = this.config.frontendUrl;

    // Mobile branch: Redis-backed state (no session cookie required).
    if (state) {
      const mobileState = await this.mobileOauthState.consume(state);
      if (mobileState) {
        await this.handleMobileCallback(code, mobileState, res);
        return;
      }
    }

    const postLoginBase = req.session.clientRedirectUri ?? defaultFront;

    if (!code || !state) {
      res.redirect(
        this.authService.authErrorUrl(postLoginBase, 'missing_params'),
      );
      return;
    }

    if (state !== req.session.oauthState) {
      // No web session state — likely an expired/invalid mobile OAuth state.
      if (!req.session.oauthState && this.config.mobileRedirectUris[0]) {
        res.redirect(
          this.authService.mobileErrorRedirectUrl(
            this.config.mobileRedirectUris[0],
            'state_mismatch',
          ),
        );
        return;
      }
      res.redirect(
        this.authService.authErrorUrl(postLoginBase, 'state_mismatch'),
      );
      return;
    }

    delete req.session.oauthState;

    try {
      const idpHint = req.session.idpHint;
      const result = await this.authService.exchangeCodeAndUpsertUser(
        code,
        idpHint,
      );

      req.session.userId = result.user.id;
      req.session.keycloakSub = result.user.keycloakSub;
      req.session.accessToken = result.accessToken;
      req.session.refreshToken = result.refreshToken;
      req.session.tokenExpiresAt = result.tokenExpiresAt;
      req.session.idpHint = result.idpHint;
      req.session.roles = result.roles;
      req.session.clinicId = result.user.clinicId ?? null;

      const redirectUrl = new URL(
        req.session.clientRedirectUri ?? defaultFront,
      );
      if (result.isNewUser) {
        redirectUrl.searchParams.set('isNewUser', 'true');
      }

      req.session.save((err) => {
        if (err) {
          this.logger.error('Failed to save session after callback', err);
        }
        res.redirect(redirectUrl.toString());
      });
    } catch (err) {
      this.logger.error('OAuth callback failed', err);
      res.redirect(
        this.authService.authErrorUrl(
          req.session.clientRedirectUri ?? defaultFront,
          'exchange_failed',
        ),
      );
    }
  }

  private async handleMobileCallback(
    code: string | undefined,
    mobileState: {
      clientRedirectUri: string;
      idpHint?: string;
    },
    res: Response,
  ): Promise<void> {
    const deepLink = mobileState.clientRedirectUri;

    if (!code) {
      res.redirect(
        this.authService.mobileErrorRedirectUrl(deepLink, 'missing_params'),
      );
      return;
    }

    try {
      const result = await this.authService.exchangeCodeAndUpsertUser(
        code,
        mobileState.idpHint,
      );

      const expiresIn = Math.max(
        1,
        Math.floor((result.tokenExpiresAt - Date.now()) / 1000) + 30,
      );

      const mobileCode = await this.mobileAuthCode.issue({
        userId: result.user.id,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
        expiresIn,
        roles: result.roles,
        isNewUser: result.isNewUser,
        idpHint: result.idpHint,
      });

      const separator = deepLink.includes('?') ? '&' : '?';
      let redirect = `${deepLink}${separator}code=${encodeURIComponent(mobileCode)}`;
      if (result.isNewUser) {
        redirect += '&isNewUser=true';
      }
      res.redirect(redirect);
    } catch (err) {
      this.logger.error('Mobile OAuth callback failed', err);
      res.redirect(
        this.authService.mobileErrorRedirectUrl(deepLink, 'exchange_failed'),
      );
    }
  }

  @Get('status')
  @ApiCookieAuth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check authentication status',
    description:
      'Returns whether the current request is authenticated via session cookie or Bearer access token.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { authenticated: { type: 'boolean' } },
    },
  })
  async getStatus(@Req() req: Request) {
    const existing = getAuthContext(req);
    if (existing?.userId) {
      return { authenticated: true };
    }

    const header = req.headers.authorization;
    if (typeof header === 'string') {
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        try {
          await this.authService.authenticateBearerToken(token);
          return { authenticated: true };
        } catch {
          return { authenticated: false };
        }
      }
    }

    return { authenticated: false };
  }

  @Get('dev/session')
  @ApiOperation({
    summary: '[DEV ONLY] Create session for App Admin',
    description:
      'Logs in via password grant as the realm App Admin (KEYCLOAK_DEV_ADMIN_USER), ' +
      'creates a server session, and returns the session id (sid) for Swagger cookie auth. ' +
      'Returns 404 in production.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        sid: {
          type: 'string',
          description: 'Session id — use as sid cookie in Swagger',
        },
        username: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  async devSession(@Req() req: Request) {
    if (this.config.nodeEnv === 'production') {
      throw new NotFoundException();
    }

    const result = await this.authService.devCreateSessionForAdmin();

    req.session.userId = result.user.id;
    req.session.keycloakSub = result.user.keycloakSub;
    req.session.accessToken = result.accessToken;
    req.session.refreshToken = result.refreshToken;
    req.session.tokenExpiresAt = result.tokenExpiresAt;
    req.session.idpHint = result.idpHint;
    req.session.roles = result.roles;
    req.session.clinicId = result.user.clinicId ?? null;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          this.logger.error('Failed to save dev session', err);
          reject(
            new InternalServerErrorException('Failed to persist dev session'),
          );
          return;
        }
        resolve();
      });
    });

    return {
      sid: req.session.id,
      username: result.username,
      email: result.email,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout and destroy session',
    description:
      'Revokes the Keycloak refresh token and destroys the server session. ' +
      'The session cookie is cleared.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No active session' })
  async logout(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.session.refreshToken;

    if (refreshToken) {
      await this.authService.revokeToken(refreshToken);
    }

    req.session.destroy((err) => {
      if (err) {
        this.logger.error('Failed to destroy session', err);
      }
      res.clearCookie('sid');
      res.json({ success: true });
    });
  }
}
