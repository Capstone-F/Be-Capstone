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
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';
import { AppConfigService } from '../config/config.service';
import { LoginPostDto } from './dto/login-post.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start login (SPA): return Keycloak login_uri',
    description:
      'Stores client_redirect_uri in the session, returns login_uri for the browser ' +
      '(e.g. window.location.href = login_uri). After OAuth, GET /auth/callback ' +
      'redirects the browser to client_redirect_uri.',
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
    const clientUri = this.authService.validateClientRedirectUri(
      body?.client_redirect_uri,
    );
    const idpHint =
      typeof body?.idpHint === 'string' && body.idpHint.trim()
        ? body.idpHint.trim()
        : undefined;

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
      'The backend exchanges the code for tokens, stores them in the session, ' +
      'and redirects to client_redirect_uri from POST /auth/login.',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const defaultFront = this.config.frontendUrl;
    const postLoginBase = req.session.clientRedirectUri ?? defaultFront;

    if (!code || !state) {
      res.redirect(
        this.authService.authErrorUrl(postLoginBase, 'missing_params'),
      );
      return;
    }

    if (state !== req.session.oauthState) {
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

  @Get('status')
  @ApiOperation({
    summary: 'Check authentication status',
    description: 'Returns whether the current request has an active session.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { authenticated: { type: 'boolean' } },
    },
  })
  getStatus(@Req() req: Request) {
    return { authenticated: !!req.session?.userId };
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
