import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

type TokenRequestBody = {
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  idpHint?: string;
};

type RefreshRequestBody = {
  refreshToken?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('endpoints')
  getEndpoints() {
    return this.authService.getOidcEndpoints();
  }

  @Get('login')
  getLoginUrl(
    @Query('redirectUri') redirectUri?: string,
    @Query('idpHint') idpHint?: string,
  ) {
    return this.authService.getLoginUrl(redirectUri, idpHint);
  }

  @Get('callback')
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
  exchangeToken(@Body() body: TokenRequestBody) {
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
  refreshToken(@Body() body: RefreshRequestBody) {
    if (!body.refreshToken) {
      throw new BadRequestException('Missing required body field: refreshToken');
    }
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  logout(@Body() body: RefreshRequestBody) {
    if (!body.refreshToken) {
      throw new BadRequestException('Missing required body field: refreshToken');
    }
    return this.authService.logout(body.refreshToken);
  }

  @Get('me')
  getProfile(@Headers('authorization') authorization?: string) {
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
