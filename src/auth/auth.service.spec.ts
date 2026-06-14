import {
  BadGatewayException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { AuthService } from './auth.service';
import { Role } from './roles.enum';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const mockUser = { id: 'uuid-1', keycloakSub: 'sub-001' } as User;
const mockUsersService = {
  upsertFromKeycloak: jest
    .fn()
    .mockResolvedValue({ user: mockUser, isNewUser: false }),
  findById: jest.fn().mockResolvedValue(mockUser),
} as unknown as jest.Mocked<UsersService>;

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const config = {
    keycloakPublicUrl: 'http://localhost:8080',
    keycloakInternalUrl: 'http://keycloak:8080',
    keycloakRealm: 'be-capstone',
    keycloakClientId: 'be-capstone-api',
    keycloakClientSecret: 'be-capstone-secret',
    keycloakRedirectUri: 'http://localhost:3000/auth/callback',
    frontendUrl: 'http://localhost:5173',
  } as AppConfigService;
  const keycloakAdmin = new KeycloakAdminService(config);
  const service = new AuthService(config, mockUsersService, keycloakAdmin);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('buildLoginUrl', () => {
    it('should build login url with expected query params', () => {
      const result = service.buildLoginUrl();
      const url = new URL(result.url);

      expect(url.pathname).toContain('/protocol/openid-connect/auth');
      expect(url.searchParams.get('client_id')).toBe('be-capstone-api');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/auth/callback',
      );
      expect(result.state).toBeTruthy();
    });

    it('should add kc_idp_hint when idpHint is provided', () => {
      const result = service.buildLoginUrl('google');
      const url = new URL(result.url);
      expect(url.searchParams.get('kc_idp_hint')).toBe('google');
    });
  });

  describe('exchangeCodeAndUpsertUser', () => {
    it('should exchange code and return session data', async () => {
      const idToken = makeJwt({
        sub: '123',
        email: 'user@test.com',
        name: 'User',
      });
      const accessToken = makeJwt({
        sub: '123',
        realm_access: { roles: ['customer', 'offline_access'] },
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: accessToken,
            id_token: idToken,
            refresh_token: 'rt',
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response);

      const result = await service.exchangeCodeAndUpsertUser('abc', 'google');

      expect(result.accessToken).toBe(accessToken);
      expect(result.refreshToken).toBe('rt');
      expect(result.roles).toEqual([Role.Customer]);
      expect(result.user).toEqual(mockUser);
      expect(result.isNewUser).toBe(false);
      expect(result.tokenExpiresAt).toBeGreaterThan(Date.now());
      expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
        expect.objectContaining({ sub: '123' }),
        'google',
        [Role.Customer],
      );
    });

    it('should fall back to access_token if id_token is missing', async () => {
      const accessToken = makeJwt({
        sub: 'abc',
        email: 'fallback@test.com',
        realm_access: { roles: ['customer'] },
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response);

      const result = await service.exchangeCodeAndUpsertUser('code-xyz');

      expect(result.user).toEqual(mockUser);
      expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'abc' }),
        'keycloak',
        [Role.Customer],
      );
    });

    it('should throw if token endpoint fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      } as Response);

      await expect(
        service.exchangeCodeAndUpsertUser('bad'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should not refresh if token is still valid', async () => {
      global.fetch = jest.fn();
      const session = {
        refreshToken: 'rt',
        tokenExpiresAt: Date.now() + 60_000,
      } as any;

      await service.refreshTokenIfNeeded(session);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should refresh if token is expired', async () => {
      const newAccessToken = makeJwt({
        sub: 'u1',
        realm_access: { roles: ['staff'] },
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: newAccessToken,
            refresh_token: 'new-rt',
            expires_in: 300,
          }),
      } as Response);

      const session = {
        userId: 'u1',
        refreshToken: 'old-rt',
        tokenExpiresAt: Date.now() - 1000,
      } as any;

      await service.refreshTokenIfNeeded(session);

      expect(session.accessToken).toBe(newAccessToken);
      expect(session.refreshToken).toBe('new-rt');
      expect(session.roles).toEqual([Role.Staff]);
      expect(session.tokenExpiresAt).toBeGreaterThan(Date.now());
    });

    it('should throw UnauthorizedException if refresh fails', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      } as Response);

      const session = {
        userId: 'u1',
        refreshToken: 'expired-rt',
        tokenExpiresAt: Date.now() - 1000,
      } as any;

      await expect(
        service.refreshTokenIfNeeded(session),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revokeToken', () => {
    it('should call keycloak logout endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      } as Response);

      await service.revokeToken('some-rt');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('/protocol/openid-connect/logout');
    });

    it('should not throw if revocation fails', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'error',
      } as Response);

      await expect(service.revokeToken('bad-rt')).resolves.toBeUndefined();
    });
  });

  describe('validateClientRedirectUri', () => {
    it('should return normalized URL when origin matches FRONTEND_URL', () => {
      expect(
        service.validateClientRedirectUri('http://localhost:5173/app'),
      ).toBe('http://localhost:5173/app');
    });

    it('should throw when origin mismatches', () => {
      expect(() =>
        service.validateClientRedirectUri('http://evil.com/'),
      ).toThrow(BadRequestException);
    });

    it('should throw when missing', () => {
      expect(() => service.validateClientRedirectUri(undefined)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('authErrorUrl', () => {
    it('should build error URL on same origin', () => {
      expect(service.authErrorUrl('http://localhost:5173/dashboard', 'x')).toBe(
        'http://localhost:5173/auth/error?reason=x',
      );
    });
  });
});
