import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiHeaders,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OidcEndpointsDto } from './dto/oidc-endpoints.dto';
import { LoginUrlDto } from './dto/login-url.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import {
  AuthCallbackResponseDto,
  LogoutResponseDto,
  TokenResponseDto,
} from './dto/token-response.dto';
import { type Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Get('endpoints')
  @ApiOperation({
    summary: 'Get OIDC endpoint URLs',
    description:
      'Returns all public-facing Keycloak OIDC endpoint URLs for the configured realm. ' +
      'Frontend clients can use these to build authorization flows directly.',
  })
  @ApiOkResponse({ type: OidcEndpointsDto })
  getEndpoints() {
    return this.authService.getOidcEndpoints();
  }

  @Get('login')
  @ApiOperation({
    summary: 'Get Keycloak login URL',
    description:
      'Builds a Keycloak authorization URL with a random state parameter. ' +
      'Redirect the user to `authorizationUrl` to start the OIDC login flow. ' +
      'Pass `idpHint=google` to skip the Keycloak login page and go straight to Google.',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description: 'Override the default redirect URI after login',
    example: 'http://localhost:3000/auth/callback',
  })
  @ApiQuery({
    name: 'idpHint',
    required: false,
    description: 'Skip Keycloak login and redirect directly to an identity provider',
    example: 'google',
  })
  @ApiOkResponse({ type: LoginUrlDto })
  getLoginUrl(
    @Query('redirectUri') redirectUri?: string,
    @Query('idpHint') idpHint?: string,
  ) {
    return this.authService.getLoginUrl(redirectUri, idpHint);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Exchange authorization code (via query params)',
    description:
      'Keycloak redirects back here with a `code` query parameter. ' +
      'The backend exchanges it for tokens, fetches the user profile, and upserts a local user record. ' +
      'Typically used as the redirect target in browser-based flows.',
  })
  @ApiQuery({ name: 'code', required: true, description: 'Authorization code from Keycloak' })
  @ApiQuery({ name: 'redirectUri', required: false, description: 'Must match the URI used during login' })
  @ApiQuery({ name: 'codeVerifier', required: false, description: 'PKCE code verifier' })
  @ApiQuery({ name: 'idpHint', required: false, description: 'IDP used (for user upsert provider field)', example: 'google' })
  @ApiOkResponse({ type: AuthCallbackResponseDto })
  @ApiBadRequestResponse({ description: 'Missing `code` query parameter' })
  exchangeAuthorizationCode(
    @Query('code') code?: string,
    @Query('redirectUri') redirectUri?: string,
    @Query('codeVerifier') codeVerifier?: string,
    @Query('idpHint') idpHint?: string,
  ) {
    if (!code) {
      throw new BadRequestException('Missing required query param: code');
    }
    return this.authService.exchangeAuthorizationCode(code, redirectUri, codeVerifier, idpHint);
  }

  @Post('token')
  @ApiOperation({
    summary: 'Exchange authorization code (via request body)',
    description:
      'Same as GET /auth/callback but accepts parameters in the request body. ' +
      'Preferred for frontend SPAs that handle the callback themselves and forward the code to the backend.',
  })
  @ApiOkResponse({ type: AuthCallbackResponseDto })
  @ApiBadRequestResponse({ description: 'Missing `code` in request body' })
  exchangeToken(@Body() body: TokenRequestDto) {
    if (!body.code) {
      throw new BadRequestException('Missing required body field: code');
    }
    return this.authService.exchangeAuthorizationCode(
      body.code,
      body.redirectUri,
      body.codeVerifier,
      body.idpHint,
    );
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange a refresh token for a new access token. ' +
      'Call this when the current access token expires.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiBadRequestResponse({ description: 'Missing `refreshToken` in request body' })
  refreshToken(@Body() body: RefreshRequestDto) {
    if (!body.refreshToken) {
      throw new BadRequestException('Missing required body field: refreshToken');
    }
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Logout and invalidate tokens',
    description:
      'Invalidates the refresh token on the Keycloak side, effectively logging out the user. ' +
      'The client should also discard stored tokens after calling this.',
  })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiBadRequestResponse({ description: 'Missing `refreshToken` in request body' })
  logout(@Body() body: RefreshRequestDto) {
    if (!body.refreshToken) {
      throw new BadRequestException('Missing required body field: refreshToken');
    }
    return this.authService.logout(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Calls Keycloak userinfo endpoint to fetch the authenticated user\'s profile. ' +
      'Requires a valid access token in the `Authorization: Bearer <token>` header.',
  })
  @ApiOkResponse({
    description: 'Keycloak user profile',
    schema: {
      type: 'object',
      example: {
        sub: '12345678-abcd-efgh-ijkl-123456789012',
        email: 'user@example.com',
        email_verified: true,
        name: 'John Doe',
        preferred_username: 'john',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  getProfile(@Req() request: Request) {
    const authorization = request.headers['authorization'];
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = this.getBearerToken(authorization);
    return this.authService.getUserInfo(token);
  }

  private getBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization header, expected "Bearer <token>"',
      );
    }

    return token;
  }
}
