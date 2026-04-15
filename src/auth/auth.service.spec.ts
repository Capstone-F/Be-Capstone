import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const mockUser = { id: 'uuid-1', keycloakSub: 'sub-001' } as User;
const mockUsersService = {
  upsertFromKeycloak: jest.fn().mockResolvedValue({ user: mockUser, isNewUser: false }),
} as unknown as UsersService;

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const config = {
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'be-capstone',
    keycloakClientId: 'be-capstone-api',
    keycloakClientSecret: 'be-capstone-secret',
    keycloakRedirectUri: 'http://localhost:3000/auth/callback',
  } as AppConfigService;
  const service = new AuthService(config, mockUsersService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should build login url with expected query params', () => {
    const result = service.getLoginUrl();
    const url = new URL(result.authorizationUrl);

    expect(url.pathname).toContain('/protocol/openid-connect/auth');
    expect(url.searchParams.get('client_id')).toBe('be-capstone-api');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback',
    );
    expect(result.state).toBeTruthy();
    expect(result.idpHint).toBeNull();
  });

  it('should add kc_idp_hint when idpHint is provided', () => {
    const result = service.getLoginUrl(undefined, 'google');
    const url = new URL(result.authorizationUrl);

    expect(url.searchParams.get('kc_idp_hint')).toBe('google');
    expect(result.idpHint).toBe('google');
  });

  it('should expose expected oidc endpoints', () => {
    const endpoints = service.getOidcEndpoints();
    expect(endpoints.issuer).toBe('http://localhost:8080/realms/be-capstone');
    expect(endpoints.tokenEndpoint).toContain('/protocol/openid-connect/token');
  });

  it('login url should use keycloak url', () => {
    const result = service.getLoginUrl();
    expect(result.authorizationUrl).toContain('http://localhost:8080');
  });

  it('token exchange should call keycloak url and decode id_token', async () => {
    const idToken = makeJwt({ sub: '123', email: 'a@b.com', name: 'Test' });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: 'at-value',
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 300,
        }),
    } as Response);

    await service.exchangeAuthorizationCode('abc');

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('localhost:8080');
  });

  it('should exchange authorization code and return decoded profile', async () => {
    const idToken = makeJwt({ sub: '123', email: 'user@test.com', name: 'User' });

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

    const result = await service.exchangeAuthorizationCode('abc', undefined, undefined, 'google');

    expect(result.token.access_token).toBe('at');
    expect(result.profile.sub).toBe('123');
    expect(result.profile.email).toBe('user@test.com');
    expect(result.user).toEqual(mockUser);
    expect(result.isNewUser).toBe(false);
    expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
      expect.objectContaining({ sub: '123' }),
      'google',
    );
  });

  it('should fall back to access_token if id_token is missing', async () => {
    const accessToken = makeJwt({ sub: 'abc', email: 'fallback@test.com' });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 300,
        }),
    } as Response);

    const result = await service.exchangeAuthorizationCode('code-xyz');

    expect(result.profile.sub).toBe('abc');
    expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'abc' }),
      'keycloak',
    );
  });

  it('should throw if token endpoint fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    } as Response);

    await expect(service.exchangeAuthorizationCode('bad')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('getUserInfo should return profile from keycloak userinfo endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: 'u1', email: 'a@b.c', name: 'Test' }),
    } as Response);

    const profile = await service.getUserInfo('valid-token');

    expect(profile.sub).toBe('u1');
    expect(profile.email).toBe('a@b.c');
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('/protocol/openid-connect/userinfo');
    expect(call[1].headers.Authorization).toBe('Bearer valid-token');
  });

  it('getUserInfo should throw on 401 from keycloak', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    } as Response);

    await expect(service.getUserInfo('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
