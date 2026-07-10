import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/config.service';
import { MobileOauthStateService } from './mobile-oauth-state.service';
import { MobileAuthCodeService } from './mobile-auth-code.service';

describe('AuthController', () => {
  const authService = {
    buildLoginUrl: jest.fn(),
    exchangeCodeAndUpsertUser: jest.fn(),
    revokeToken: jest.fn(),
    refreshTokenIfNeeded: jest.fn(),
    resolveClientRedirect: jest.fn((u: string | undefined) => {
      if (!u) throw new Error('client_redirect_uri required');
      if (u.startsWith('glowscan://')) {
        return { uri: u, flow: 'mobile' as const };
      }
      return { uri: u, flow: 'web' as const };
    }),
    authErrorUrl: jest.fn((base: string, reason: string) => {
      const o = new URL(base);
      return `${o.origin}/auth/error?reason=${reason}`;
    }),
    mobileErrorRedirectUrl: jest.fn(
      (deepLink: string, reason: string) => `${deepLink}?error=${reason}`,
    ),
  } as unknown as jest.Mocked<AuthService>;

  const configService = {
    frontendUrl: 'http://localhost:5173',
    mobileRedirectUris: ['glowscan://auth/callback'],
  } as AppConfigService;

  const mobileOauthState = {
    create: jest.fn(),
    consume: jest.fn(),
  } as unknown as jest.Mocked<MobileOauthStateService>;

  const mobileAuthCode = {
    issue: jest.fn(),
    consume: jest.fn(),
  } as unknown as jest.Mocked<MobileAuthCodeService>;

  const controller = new AuthController(
    authService,
    configService,
    mobileOauthState,
    mobileAuthCode,
  );

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
    mobileOauthState.consume.mockResolvedValue(null);
  });

  describe('POST /auth/login', () => {
    it('should return login_uri and store client_redirect_uri (web)', async () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'http://kc/auth?state=1',
        state: 'oauth-state',
      });

      const session = mockSession();
      const req = { session } as any;

      const result = await controller.postLogin(
        { client_redirect_uri: 'http://localhost:5173/app' },
        req,
      );

      expect(authService.resolveClientRedirect).toHaveBeenCalledWith(
        'http://localhost:5173/app',
      );
      expect(session.oauthState).toBe('oauth-state');
      expect(session.clientRedirectUri).toBe('http://localhost:5173/app');
      expect(mobileOauthState.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        login_uri: 'http://kc/auth?state=1',
      });
    });

    it('should store state in Redis and not touch session (mobile)', async () => {
      mobileOauthState.create.mockResolvedValue('mobile-state');
      authService.buildLoginUrl.mockReturnValue({
        url: 'http://kc/auth?state=mobile-state',
        state: 'mobile-state',
      });

      const session = mockSession();
      const req = { session } as any;

      const result = await controller.postLogin(
        { client_redirect_uri: 'glowscan://auth/callback' },
        req,
      );

      expect(mobileOauthState.create).toHaveBeenCalledWith(
        'glowscan://auth/callback',
        undefined,
      );
      expect(authService.buildLoginUrl).toHaveBeenCalledWith(
        undefined,
        'mobile-state',
      );
      expect(session.oauthState).toBeUndefined();
      expect(session.clientRedirectUri).toBeUndefined();
      expect(result).toEqual({
        login_uri: 'http://kc/auth?state=mobile-state',
      });
    });

    it('should pass idpHint to buildLoginUrl', async () => {
      authService.buildLoginUrl.mockReturnValue({
        url: 'http://kc/auth',
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
    it('should redirect to frontend with error on missing params (web session)', async () => {
      const req = {
        session: mockSession({ oauthState: 'expected' }),
      } as any;
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
        roles: ['customer'],
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

    it('should redirect to client_redirect_uri when set on session', async () => {
      authService.exchangeCodeAndUpsertUser.mockResolvedValue({
        user: { id: 'u1', keycloakSub: 'kc-sub' } as any,
        isNewUser: false,
        accessToken: 'at',
        refreshToken: 'rt',
        tokenExpiresAt: Date.now() + 300_000,
        idpHint: 'keycloak',
        roles: ['customer'],
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

    it('should issue one-time code and deep-link redirect for mobile (no cookie)', async () => {
      mobileOauthState.consume.mockResolvedValue({
        clientRedirectUri: 'glowscan://auth/callback',
        flow: 'mobile',
        createdAt: Date.now(),
      });
      authService.exchangeCodeAndUpsertUser.mockResolvedValue({
        user: { id: 'u1', keycloakSub: 'kc-sub' } as any,
        isNewUser: false,
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
        tokenExpiresAt: Date.now() + 300_000,
        idpHint: 'keycloak',
        roles: ['customer'],
      });
      mobileAuthCode.issue.mockResolvedValue('MOBILE_CODE');

      const req = { session: mockSession() } as any;
      const res = mockRes() as any;

      await controller.callback('kc-code', 'mobile-state', req, res);

      expect(mobileAuthCode.issue).toHaveBeenCalled();
      const redirectUrl = res.redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain(
        'glowscan://auth/callback?code=MOBILE_CODE',
      );
      expect(redirectUrl).not.toContain('secret-access');
      expect(redirectUrl).not.toContain('secret-refresh');
      expect(redirectUrl).not.toContain('accessToken');
      expect(redirectUrl).not.toContain('refreshToken');
      expect(req.session.userId).toBeUndefined();
    });

    it('should redirect mobile error on exchange failure', async () => {
      mobileOauthState.consume.mockResolvedValue({
        clientRedirectUri: 'glowscan://auth/callback',
        flow: 'mobile',
        createdAt: Date.now(),
      });
      authService.exchangeCodeAndUpsertUser.mockRejectedValue(
        new Error('kc fail'),
      );

      const req = { session: mockSession() } as any;
      const res = mockRes() as any;

      await controller.callback('kc-code', 'mobile-state', req, res);

      expect(authService.mobileErrorRedirectUrl).toHaveBeenCalledWith(
        'glowscan://auth/callback',
        'exchange_failed',
      );
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
