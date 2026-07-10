import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MobileAuthCodeService } from './mobile-auth-code.service';
import { UsersService } from '../users/users.service';

export type MobileTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Awaited<ReturnType<UsersService['getOwnProfile']>>;
  isNewUser: boolean;
};

@Injectable()
export class MobileAuthService {
  constructor(
    private readonly mobileAuthCode: MobileAuthCodeService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  async exchangeCode(code: string): Promise<MobileTokenResponse> {
    const payload = await this.mobileAuthCode.consume(code);
    if (!payload) {
      throw new UnauthorizedException('Invalid, expired, or already used code');
    }

    const user = await this.usersService.getOwnProfile(payload.userId);

    return {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresIn: payload.expiresIn,
      user,
      isNewUser: payload.isNewUser,
    };
  }

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const refreshed = await this.authService.refreshWithToken(refreshToken);
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresIn,
    };
  }
}
