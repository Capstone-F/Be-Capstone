import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/config.service';

describe('AuthController', () => {
  const authService = {
    buildLoginUrl: jest.fn(),
    exchangeCodeAndUpsertUser: jest.fn(),
    revokeToken: jest.fn(),
    buildLogoutUrl: jest.fn(),
    findUserById: jest.fn(),
    refreshTokenIfNeeded: jest.fn(),
    validateClientRedirectUri: jest.fn((u: string | undefined) => {
      if (!u) throw new Error('client_redirect_uri required');
      return u;
    }),
    authErrorUrl: jest.fn((base: string, reason: string) => {
      const o = new URL(base);
      return `${o.origin}/auth/error?reason=${reason}`;
    }),
  } as unknown as jest.Mocked<AuthService>;

  const configService = {
    frontendUrl: 'http://localhost:5173',
  } as AppConfigService;

  const controller = new AuthController(authService, configService);

  function mockSession(data: Record<string, unknown> = {}): any {
    return {
      ...data,
      save: jest.fn((cb: (err?: Error) => void) => cb()),
      destroy: jest.fn((cb: (err?: Error) => void) => cb()),
    };
  }

  function mockRes() {
    const res: Record<string, jest.Mock> = {};
    res.redirect = jest.fn();
    res.clearCookie = jest.fn();
    res.json = jest.fn();
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('should return login_uri and store client_redirect_uri', async () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'https://tenant.us.auth0.com/authorize?state=1',
        state: 'oauth-state',
      });

      const session = mockSession();
      const req = { session } as any;

      const result = await controller.postLogin(
        { client_redirect_uri: 'http://localhost:5173/app' },
        req,
      );

      expect(authService.validateClientRedirectUri).toHaveBeenCalledWith(
        'http://localhost:5173/app',
      );
      expect(session.oauthState).toBe('oauth-state');
      expect(session.clientRedirectUri).toBe('http://localhost:5173/app');
      expect(result).toEqual({
        login_uri: 'https://tenant.us.auth0.com/authorize?state=1',
      });
    });

    it('should pass idpHint to buildLoginUrl', async () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'https://tenant.us.auth0.com/authorize',
        state: 's',
      });

      const session = mockSession();
      const req = { session } as any;

      await controller.postLogin(
        {
          client_redirect_uri: 'http://localhost:5173/',
          idpHint: 'google',
        },
        req,
      );

      expect(authService.buildLoginUrl).toHaveBeenCalledWith('google');
      expect(session.idpHint).toBe('google');
    });
  });

  describe('GET /auth/callback', () => {
    it('should redirect to frontend with error on missing params', async () => {
      const req = { session: mockSession() } as any;
      const res = mockRes() as any;

      await controller.callback('', '', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/error?reason=missing_params',
      );
    });

    it('should redirect to frontend with error on state mismatch', async () => {
      const req = { session: mockSession({ oauthState: 'expected' }) } as any;
      const res = mockRes() as any;

      await controller.callback('code', 'wrong-state', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/auth/error?reason=state_mismatch',
      );
    });

    it('should exchange code and redirect to frontend on success', async () => {
      authService.exchangeCodeAndUpsertUser.mockResolvedValue({
        user: { id: 'u1', auth0Sub: 'auth0|abc' } as any,
        isNewUser: true,
        accessToken: 'at',
        refreshToken: 'rt',
        tokenExpiresAt: Date.now() + 300_000,
        idpHint: null,
      });

      const session = mockSession({ oauthState: 'state-ok' });
      const req = { session } as any;
      const res = mockRes() as any;

      await controller.callback('the-code', 'state-ok', req, res);

      expect(authService.exchangeCodeAndUpsertUser).toHaveBeenCalledWith(
        'the-code',
        undefined,
      );
      expect(session.userId).toBe('u1');
      expect(session.auth0Sub).toBe('auth0|abc');
      expect(session.accessToken).toBe('at');
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('isNewUser=true'),
      );
    });

    it('should redirect to client_redirect_uri when set on session', async () => {
      authService.exchangeCodeAndUpsertUser.mockResolvedValue({
        user: { id: 'u1', auth0Sub: 'auth0|abc' } as any,
        isNewUser: false,
        accessToken: 'at',
        refreshToken: 'rt',
        tokenExpiresAt: Date.now() + 300_000,
        idpHint: null,
      });

      const session = mockSession({
        oauthState: 'state-ok',
        clientRedirectUri: 'http://localhost:5173/dashboard',
      });
      const req = { session } as any;
      const res = mockRes() as any;

      await controller.callback('the-code', 'state-ok', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/dashboard',
      );
    });
  });

  describe('GET /auth/me', () => {
    it('should return user profile', async () => {
      const user = { id: 'u1', email: 'a@b.c' };
      authService.findUserById.mockResolvedValue(user as any);

      const req = { session: { userId: 'u1' } } as any;
      const result = await controller.getProfile(req);

      expect(result).toEqual(user);
      expect(authService.findUserById).toHaveBeenCalledWith('u1');
    });
  });

  describe('GET /auth/status', () => {
    it('should return authenticated true when session has userId', () => {
      const req = { session: { userId: 'u1' } } as any;
      expect(controller.getStatus(req)).toEqual({ authenticated: true });
    });

    it('should return authenticated false when no session', () => {
      const req = { session: {} } as any;
      expect(controller.getStatus(req)).toEqual({ authenticated: false });
    });
  });

  describe('POST /auth/logout', () => {
    it('should revoke token, build Auth0 logout URL, and destroy session', async () => {
      authService.revokeToken.mockResolvedValue(undefined);
      authService.buildLogoutUrl.mockReturnValue(
        'https://tenant.us.auth0.com/v2/logout?client_id=client-id&returnTo=http%3A%2F%2Flocalhost%3A5173',
      );

      const session = mockSession({ refreshToken: 'rt', userId: 'u1' });
      const req = { session } as any;
      const res = mockRes() as any;

      await controller.logout({}, req, res);

      expect(authService.revokeToken).toHaveBeenCalledWith('rt');
      expect(authService.buildLogoutUrl).toHaveBeenCalledWith(undefined);
      expect(session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('sid');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logout_uri:
          'https://tenant.us.auth0.com/v2/logout?client_id=client-id&returnTo=http%3A%2F%2Flocalhost%3A5173',
      });
    });

    it('should pass validated return_to to buildLogoutUrl when provided', async () => {
      authService.revokeToken.mockResolvedValue(undefined);
      authService.buildLogoutUrl.mockReturnValue('https://tenant/v2/logout');

      const session = mockSession({ refreshToken: 'rt', userId: 'u1' });
      const req = { session } as any;
      const res = mockRes() as any;

      await controller.logout(
        { return_to: 'http://localhost:5173/goodbye' },
        req,
        res,
      );

      expect(authService.validateClientRedirectUri).toHaveBeenCalledWith(
        'http://localhost:5173/goodbye',
      );
      expect(authService.buildLogoutUrl).toHaveBeenCalledWith(
        'http://localhost:5173/goodbye',
      );
    });
  });
});
