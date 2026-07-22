import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { KeycloakAdminService } from './keycloak-admin.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

describe('KeycloakAdminService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: KeycloakAdminService;

  const config = {
    keycloakPublicUrl: 'http://localhost:8080',
    keycloakInternalUrl: 'http://keycloak:8080',
    keycloakRealm: 'be-capstone',
    keycloakClientId: 'be-capstone-api',
    keycloakClientSecret: 'be-capstone-secret',
    keycloakAdminUser: 'admin',
    keycloakAdminPassword: 'admin',
  } as AppConfigService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new KeycloakAdminService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('issuer helpers', () => {
    it('builds public and internal issuers and endpoints', () => {
      expect(service.getPublicIssuer()).toBe(
        'http://localhost:8080/realms/be-capstone',
      );
      expect(service.getInternalIssuer()).toBe(
        'http://keycloak:8080/realms/be-capstone',
      );
      expect(service.getTokenEndpoint()).toContain(
        '/protocol/openid-connect/token',
      );
      expect(service.getLogoutEndpoint()).toContain(
        '/protocol/openid-connect/logout',
      );
    });
  });

  describe('decodeJwtPayload / extractRolesFromToken', () => {
    it('decodes payload and extracts realm roles', () => {
      const token = makeJwt({
        sub: 'u1',
        realm_access: { roles: ['customer', 'offline_access'] },
      });

      expect(service.decodeJwtPayload(token)).toEqual(
        expect.objectContaining({ sub: 'u1' }),
      );
      expect(service.extractRolesFromToken(token)).toEqual([
        'customer',
        'offline_access',
      ]);
    });

    it('throws BadGatewayException for malformed token', () => {
      expect(() => service.decodeJwtPayload('not-a-jwt')).toThrow(
        BadGatewayException,
      );
    });
  });

  describe('postForm', () => {
    it('posts form-urlencoded body with client credentials', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'at', expires_in: 300 }),
      });

      const form = new URLSearchParams({ grant_type: 'authorization_code' });
      const result = await service.postForm<{ access_token: string }>(
        service.getTokenEndpoint(),
        form,
      );

      expect(result.access_token).toBe('at');
      expect(fetchMock).toHaveBeenCalledWith(
        service.getTokenEndpoint(),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain('client_id=be-capstone-api');
      expect(body).toContain('client_secret=be-capstone-secret');
    });

    it('throws BadGatewayException when Keycloak returns non-2xx', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });

      await expect(
        service.postForm(service.getTokenEndpoint(), new URLSearchParams()),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('getAdminToken', () => {
    it('returns access_token from master realm password grant', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'admin-at', expires_in: 60 }),
      });

      await expect(service.getAdminToken()).resolves.toBe('admin-at');
      expect(fetchMock.mock.calls[0][0]).toContain(
        '/realms/master/protocol/openid-connect/token',
      );
    });

    it('throws when access_token is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });

      await expect(service.getAdminToken()).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('requestPasswordGrant', () => {
    it('returns token response on success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'user-at',
          refresh_token: 'rt',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      });

      const token = await service.requestPasswordGrant('user', 'pass');
      expect(token.access_token).toBe('user-at');
      expect(fetchMock).toHaveBeenCalledWith(
        service.getTokenEndpoint(),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('maps 401 to UnauthorizedException', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        service.requestPasswordGrant('user', 'bad'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('maps other failures to BadGatewayException', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      });

      await expect(
        service.requestPasswordGrant('user', 'pass'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('admin user APIs', () => {
    it('createUser returns id from Location header', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 201,
        headers: {
          get: (name: string) =>
            name === 'Location'
              ? 'http://keycloak:8080/admin/realms/be-capstone/users/new-id'
              : null,
        },
      });

      await expect(
        service.createUser('admin-token', {
          username: 'new',
          email: 'new@example.com',
        }),
      ).resolves.toBe('new-id');
    });

    it('getRealmRole returns role payload', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'role-1', name: 'customer' }),
      });

      await expect(
        service.getRealmRole('admin-token', 'customer'),
      ).resolves.toEqual({ id: 'role-1', name: 'customer' });
    });
  });
});
