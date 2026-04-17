import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';
import { AppConfigService } from '../config/config.service';
import { SessionUserDto } from './dto/session-user.dto';
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Get('login')
  @ApiOperation({
    summary: 'Start login flow (browser redirect)',
    description:
      'Redirects the browser to Keycloak login page. ' +
      'After authentication, Keycloak redirects back to GET /auth/callback. ' +
      'Pass idpHint=google to skip the Keycloak page and go straight to Google.',
  })
  @ApiQuery({
    name: 'idpHint',
    required: false,
    description: 'Skip Keycloak login and redirect to an identity provider',
    example: 'google',
  })
  login(
    @Query('idpHint') idpHint: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { url, state } = this.authService.buildLoginUrl(idpHint);

    req.session.oauthState = state;
    if (idpHint) {
      req.session.idpHint = idpHint;
    }

    req.session.save((err) => {
      if (err) {
        this.logger.error('Failed to save session before login redirect', err);
      }
      res.redirect(url);
    });
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback (Keycloak redirects here)',
    description:
      'Keycloak redirects the browser here after authentication. ' +
      'The backend exchanges the code for tokens, stores them in the session, ' +
      'and redirects to the frontend URL.',
  })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.frontendUrl;

    if (!code || !state) {
      res.redirect(`${frontendUrl}/auth/error?reason=missing_params`);
      return;
    }

    if (state !== req.session.oauthState) {
      res.redirect(`${frontendUrl}/auth/error?reason=state_mismatch`);
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

      const redirectUrl = new URL(frontendUrl);
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
      res.redirect(`${frontendUrl}/auth/error?reason=exchange_failed`);
    }
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user profile from the local database. ' +
      'Requires a valid session cookie.',
  })
  @ApiOkResponse({ type: SessionUserDto })
  @ApiUnauthorizedResponse({ description: 'No active session' })
  async getProfile(@Req() req: Request) {
    return this.authService.findUserById(req.session.userId!);
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
