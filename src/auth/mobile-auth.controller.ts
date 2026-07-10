import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ExchangeMobileCodeDto } from './dto/exchange-mobile-code.dto';
import { MobileRefreshTokenDto } from './dto/mobile-refresh-token.dto';
import { MobileAuthService } from './mobile-auth.service';

@ApiTags('Auth (Mobile)')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly mobileAuthService: MobileAuthService) {}

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
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
        user: { type: 'object' },
        isNewUser: { type: 'boolean' },
      },
    },
  })
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
