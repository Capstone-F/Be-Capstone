import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MobileAuthCodeService } from './mobile-auth-code.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
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
  private readonly logger = new Logger(MobileAuthService.name);

  constructor(
    private readonly mobileAuthCode: MobileAuthCodeService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly keycloakAdmin: KeycloakAdminService,
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

  async login(
    username: string,
    password: string,
  ): Promise<MobileTokenResponse> {
    return this.authService.loginWithPassword(username, password);
  }

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<MobileTokenResponse> {
    const username = email.trim().toLowerCase();
    const { firstName, lastName } = splitName(name ?? username);

    const adminToken = await this.keycloakAdmin.getAdminToken();
    await this.keycloakAdmin.createUser(adminToken, {
      username,
      email: username,
      firstName,
      lastName,
      enabled: true,
      emailVerified: false,
      credentials: [{ type: 'password', value: password, temporary: false }],
    });

    this.logger.log(`Mobile self-registration — email: ${username}`);
    return this.authService.loginWithPassword(username, password);
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

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? name.trim(), lastName: '' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
