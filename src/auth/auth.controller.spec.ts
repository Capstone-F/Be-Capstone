import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/config.service';

describe('AuthController', () => {
  const authService = {
    buildLoginUrl: jest.fn(),
    exchangeCodeAndUpsertUser: jest.fn(),
    revokeToken: jest.fn(),
    findUserById: jest.fn(),
    refreshTokenIfNeeded: jest.fn(),
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

  describe('GET /auth/login', () => {
    it('should redirect to keycloak auth url', () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'http://kc/auth?params',
        state: 'state-123',
      });

      const session = mockSession();
      const req = { session } as any;
      const res = mockRes() as any;

      controller.login(undefined, req, res);

      expect(authService.buildLoginUrl).toHaveBeenCalledWith(undefined);
      expect(session.oauthState).toBe('state-123');
      expect(res.redirect).toHaveBeenCalledWith('http://kc/auth?params');
    });

    it('should pass idpHint to buildLoginUrl', () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'http://kc/auth?kc_idp_hint=google',
        state: 'state-456',
      });

      const session = mockSession();
      const req = { session } as any;
      const res = mockRes() as any;

      controller.login('google', req, res);

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
        user: { id: 'u1', keycloakSub: 'kc-sub' } as any,
        isNewUser: true,
        accessToken: 'at',
        refreshToken: 'rt',
        tokenExpiresAt: Date.now() + 300_000,
        idpHint: 'keycloak',
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
      expect(session.accessToken).toBe('at');
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('isNewUser=true'),
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
    it('should revoke token and destroy session', async () => {
      authService.revokeToken.mockResolvedValue(undefined);

      const session = mockSession({ refreshToken: 'rt', userId: 'u1' });
      const req = { session } as any;
      const res = mockRes() as any;

      await controller.logout(req, res);

      expect(authService.revokeToken).toHaveBeenCalledWith('rt');
      expect(session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('sid');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
