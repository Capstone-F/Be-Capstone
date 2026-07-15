import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ExchangeMobileCodeDto } from './dto/exchange-mobile-code.dto';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { MobileRefreshTokenDto } from './dto/mobile-refresh-token.dto';
import { MobileRegisterDto } from './dto/mobile-register.dto';
import { MobileAuthService } from './mobile-auth.service';

const TOKEN_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    expiresIn: { type: 'number' },
    user: { type: 'object' },
    isNewUser: { type: 'boolean' },
  },
};

@ApiTags('Auth (Mobile)')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly mobileAuthService: MobileAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with username/password (no redirect)',
    description:
      'Authenticates a user via Keycloak password grant and returns ' +
      'access/refresh tokens plus the local user profile.',
  })
  @ApiBody({ type: MobileLoginDto })
  @ApiOkResponse({ schema: TOKEN_RESPONSE_SCHEMA })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  async login(@Body() body: MobileLoginDto) {
    return this.mobileAuthService.login(body.username, body.password);
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register a new customer account (no redirect)',
    description:
      'Creates a new Keycloak user with the customer role, then returns ' +
      'access/refresh tokens plus the local user profile.',
  })
  @ApiBody({ type: MobileRegisterDto })
  @ApiOkResponse({ schema: TOKEN_RESPONSE_SCHEMA })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() body: MobileRegisterDto) {
    return this.mobileAuthService.register(
      body.email,
      body.password,
      body.name,
    );
  }

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange one-time mobile auth code for tokens',
    description:
      'Consumes the one-time code from the deep-link callback and returns ' +
      'Keycloak access/refresh tokens plus the local user profile. ' +
      'The code can only be used once and expires quickly.',
  })
  @ApiBody({ type: ExchangeMobileCodeDto })
  @ApiOkResponse({ schema: TOKEN_RESPONSE_SCHEMA })
  @ApiUnauthorizedResponse({
    description: 'Code is invalid, expired, or already used',
  })
  async exchange(@Body() body: ExchangeMobileCodeDto) {
    return this.mobileAuthService.exchangeCode(body.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh mobile access token',
    description:
      'Exchanges a Keycloak refresh token for a new access/refresh token pair.',
  })
  @ApiBody({ type: MobileRefreshTokenDto })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid or expired',
  })
  async refresh(@Body() body: MobileRefreshTokenDto) {
    return this.mobileAuthService.refresh(body.refreshToken);
  }
}
