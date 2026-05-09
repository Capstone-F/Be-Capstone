import {
  BadGatewayException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const mockUser = { id: 'uuid-1', auth0Sub: 'auth0|abc' } as User;
const mockUsersService = {
  upsertFromAuth0: jest
    .fn()
    .mockResolvedValue({ user: mockUser, isNewUser: false }),
  findById: jest.fn().mockResolvedValue(mockUser),
} as unknown as jest.Mocked<UsersService>;

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const config = {
    auth0Domain: 'tenant.us.auth0.com',
    auth0Issuer: 'https://tenant.us.auth0.com/',
    auth0ClientId: 'client-id',
    auth0ClientSecret: 'client-secret',
    auth0Audience: 'https://api.be-capstone.local',
    auth0RedirectUri: 'http://localhost:3000/auth/callback',
    auth0LogoutReturnUrl: 'http://localhost:5173',
    frontendUrl: 'http://localhost:5173',
  } as AppConfigService;
  const service = new AuthService(config, mockUsersService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('buildLoginUrl', () => {
    it('should build login url with expected query params', () => {
      const result = service.buildLoginUrl();
      const url = new URL(result.url);

      expect(url.origin).toBe('https://tenant.us.auth0.com');
      expect(url.pathname).toBe('/authorize');
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/auth/callback',
      );
      expect(url.searchParams.get('audience')).toBe(
        'https://api.be-capstone.local',
      );
      expect(url.searchParams.get('scope')).toBe(
        'openid profile email offline_access',
      );
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.has('connection')).toBe(false);
      expect(result.state).toBeTruthy();
    });

    it('should map idpHint=google to connection=google-oauth2', () => {
      const result = service.buildLoginUrl('google');
      const url = new URL(result.url);
      expect(url.searchParams.get('connection')).toBe('google-oauth2');
    });

    it('should pass through other idpHint values as connection name', () => {
      const result = service.buildLoginUrl('github');
      const url = new URL(result.url);
      expect(url.searchParams.get('connection')).toBe('github');
    });
  });

  describe('exchangeCodeAndUpsertUser', () => {
    it('should exchange code and return session data', async () => {
      const idToken = makeJwt({
        sub: 'google-oauth2|123',
        email: 'user@test.com',
        name: 'User',
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'at',
            id_token: idToken,
            refresh_token: 'rt',
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response);

      const result = await service.exchangeCodeAndUpsertUser('abc', 'google');

      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
      expect(result.user).toEqual(mockUser);
      expect(result.isNewUser).toBe(false);
      expect(result.tokenExpiresAt).toBeGreaterThan(Date.now());
      expect(result.idpHint).toBe('google');
      expect(mockUsersService.upsertFromAuth0).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'google-oauth2|123' }),
      );
    });

    it('should fall back to access_token if id_token is missing', async () => {
      const accessToken = makeJwt({
        sub: 'auth0|abc',
        email: 'fallback@test.com',
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
      expect(result.idpHint).toBeNull();
      expect(mockUsersService.upsertFromAuth0).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'auth0|abc' }),
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

    it('should hit the Auth0 oauth/token endpoint', async () => {
      const idToken = makeJwt({ sub: 'auth0|x' });
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'at',
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response);

      await service.exchangeCodeAndUpsertUser('abc');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toBe('https://tenant.us.auth0.com/oauth/token');
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
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'new-at',
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

      expect(session.accessToken).toBe('new-at');
      expect(session.refreshToken).toBe('new-rt');
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
    it('should call Auth0 oauth/revoke endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      } as Response);

      await service.revokeToken('some-rt');

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toBe('https://tenant.us.auth0.com/oauth/revoke');
      const body = String(call[1].body);
      expect(body).toContain('token=some-rt');
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

  describe('buildLogoutUrl', () => {
    it('should build Auth0 v2/logout URL with default returnTo', () => {
      const url = new URL(service.buildLogoutUrl());
      expect(url.origin).toBe('https://tenant.us.auth0.com');
      expect(url.pathname).toBe('/v2/logout');
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('returnTo')).toBe('http://localhost:5173');
    });

    it('should respect explicit returnTo', () => {
      const url = new URL(
        service.buildLogoutUrl('http://localhost:5173/goodbye'),
      );
      expect(url.searchParams.get('returnTo')).toBe(
        'http://localhost:5173/goodbye',
      );
    });
  });

  describe('findUserById', () => {
    it('should return user', async () => {
      const user = await service.findUserById('uuid-1');
      expect(user).toEqual(mockUser);
    });

    it('should throw if user not found', async () => {
      mockUsersService.findById.mockResolvedValueOnce(null);
      await expect(service.findUserById('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
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
