import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';

const mockUser = { id: 'uuid-1', keycloakSub: 'sub-001' } as User;
const mockUsersService = {
  upsertFromKeycloak: jest.fn().mockResolvedValue({ user: mockUser, isNewUser: false }),
} as unknown as UsersService;

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const config = {
    keycloakUrl: 'http://keycloak:8080',
    keycloakPublicUrl: 'http://localhost:8080',
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

  it('should expose expected oidc endpoints using public url', () => {
    const endpoints = service.getOidcEndpoints();
    // issuer must use KEYCLOAK_PUBLIC_URL, not the internal Docker service name
    expect(endpoints.issuer).toBe('http://localhost:8080/realms/be-capstone');
    expect(endpoints.tokenEndpoint).toContain('/protocol/openid-connect/token');
    expect(endpoints.authorizationEndpoint).not.toContain('keycloak:8080');
  });

  it('login url should use public keycloak url', () => {
    const result = service.getLoginUrl();
    expect(result.authorizationUrl).toContain('http://localhost:8080');
    expect(result.authorizationUrl).not.toContain('keycloak:8080');
  });

  it('token exchange should call internal keycloak url', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'token',
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: '123' }),
      } as Response);

    await service.exchangeAuthorizationCode('abc');

    const calls = (global.fetch as jest.Mock).mock.calls;
    // first call is token endpoint (internal), second is userinfo (internal)
    expect(calls[0][0]).toContain('keycloak:8080');
    expect(calls[1][0]).toContain('keycloak:8080');
  });

  it('should exchange authorization code and return profile', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'token',
            token_type: 'Bearer',
            expires_in: 300,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: '123' }),
      } as Response);

    const result = await service.exchangeAuthorizationCode('abc', undefined, undefined, 'google');

    expect(result.token.access_token).toBe('token');
    expect(result.profile).toEqual({ sub: '123' });
    expect(result.user).toEqual(mockUser);
    expect(result.isNewUser).toBe(false);
    expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
      { sub: '123' },
      'google',
    );
  });

  it('should pass keycloak as default provider when idpHint is absent', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 't', token_type: 'Bearer', expires_in: 300 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'abc' }),
      } as Response);

    await service.exchangeAuthorizationCode('code-xyz');

    expect(mockUsersService.upsertFromKeycloak).toHaveBeenCalledWith(
      { sub: 'abc' },
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

  it('should throw if userinfo endpoint fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(service.getUserInfo('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
