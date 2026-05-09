import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import session = require('express-session');
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { UsersModule } from '../src/users/users.module';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { User } from '../src/users/user.entity';

const TEST_CONFIG: Record<string, unknown> = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'sqlite::memory:',
  auth0Domain: 'tenant.us.auth0.com',
  auth0Issuer: 'https://tenant.us.auth0.com/',
  auth0ClientId: 'client-id',
  auth0ClientSecret: 'client-secret',
  auth0Audience: 'https://api.be-capstone.local',
  auth0RedirectUri: 'http://localhost:3000/auth/callback',
  auth0LogoutReturnUrl: 'http://localhost:5173',
  redisUrl: 'redis://localhost:6379',
  sessionSecret: 'e2e-test-secret',
  frontendUrl: 'http://localhost:5173',
  corsOrigin: 'http://localhost:5173',
  getMissingRequiredKeys: () => [],
};

function extractSid(res: request.Response): string {
  const raw = res.headers['set-cookie'] ?? [];
  const cookies: string[] = Array.isArray(raw) ? raw : [raw];
  const sidCookie = cookies.find((c: string) => c.startsWith('sid='));
  return sidCookie ?? '';
}

describe('BE Capstone API (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        UsersModule,
        AuthModule,
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User],
          synchronize: true,
        }),
      ],
      controllers: [AppController, HealthController],
      providers: [AppService, HealthService],
    })
      .overrideProvider(AppConfigService)
      .useValue(TEST_CONFIG)
      .overrideProvider(HealthService)
      .useValue({
        getHealthStatus: () => ({
          status: 'ok',
          timestamp: new Date().toISOString(),
          api: { status: 'up' },
          db: { status: 'up' },
          auth0: { status: 'up' },
          redis: { status: 'up' },
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    app.use(
      session({
        name: 'sid',
        secret: 'e2e-test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: false, sameSite: 'lax' },
      }),
    );

    await app.init();

    authService = moduleFixture.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Root ──────────────────────────────────────────────────────

  describe('GET /', () => {
    it('should return "Hello World!"', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });
  });

  // ─── Health ────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return health status object', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('timestamp');
      expect(body.api).toEqual({ status: 'up' });
      expect(body.db).toEqual({ status: 'up' });
      expect(body.auth0).toEqual({ status: 'up' });
      expect(body.redis).toEqual({ status: 'up' });
    });
  });

  // ─── Auth: POST /auth/login ──────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should return login_uri JSON and set session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/after-login' })
        .expect(200);

      const loginUri = new URL(res.body.login_uri);
      expect(loginUri.origin).toBe('https://tenant.us.auth0.com');
      expect(loginUri.pathname).toBe('/authorize');
      expect(loginUri.searchParams.get('client_id')).toBe('client-id');
      expect(loginUri.searchParams.get('response_type')).toBe('code');
      expect(loginUri.searchParams.get('audience')).toBe(
        'https://api.be-capstone.local',
      );
      expect(loginUri.searchParams.get('state')).toBeTruthy();
      expect(extractSid(res)).toBeTruthy();
    });

    it('should map idpHint=google to connection=google-oauth2 in login_uri', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          client_redirect_uri: 'http://localhost:5173/',
          idpHint: 'google',
        })
        .expect(200);

      expect(new URL(res.body.login_uri).searchParams.get('connection')).toBe(
        'google-oauth2',
      );
    });

    it('should return 400 when client_redirect_uri origin does not match FRONTEND_URL', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://evil.example/' })
        .expect(400);
    });

    it('should redirect callback to client_redirect_uri after OAuth', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/custom-path' })
        .expect(200);
      const sid = extractSid(loginRes);
      const loginUrl = new URL(loginRes.body.login_uri);
      const oauthState = loginUrl.searchParams.get('state')!;

      jest
        .spyOn(authService, 'exchangeCodeAndUpsertUser')
        .mockResolvedValueOnce({
          user: {
            id: 'e2e-user-id',
            auth0Sub: 'auth0|e2e',
            email: 'e2e@example.com',
            name: 'E2E User',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          isNewUser: false,
          accessToken: 'at',
          refreshToken: 'rt',
          tokenExpiresAt: Date.now() + 300_000,
          idpHint: null,
        });

      const cb = await request(app.getHttpServer())
        .get(`/auth/callback?code=c1&state=${oauthState}`)
        .set('Cookie', sid)
        .expect(302);

      expect(cb.headers.location).toBe('http://localhost:5173/custom-path');
    });
  });

  // ─── Auth: /auth/callback ──────────────────────────────────────

  describe('GET /auth/callback', () => {
    it('should redirect to frontend error on missing params', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/callback')
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:5173/auth/error?reason=missing_params',
      );
    });

    it('should redirect to frontend error on empty code', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/callback?code=&state=abc')
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:5173/auth/error?reason=missing_params',
      );
    });

    it('should redirect to frontend error on state mismatch', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/' })
        .expect(200);
      const sid = extractSid(loginRes);

      const res = await request(app.getHttpServer())
        .get('/auth/callback?code=test-code&state=wrong-state')
        .set('Cookie', sid)
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:5173/auth/error?reason=state_mismatch',
      );
    });

    it('should exchange code and redirect to frontend on success', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/' })
        .expect(200);
      const sid = extractSid(loginRes);

      const loginUrl = new URL(loginRes.body.login_uri);
      const oauthState = loginUrl.searchParams.get('state')!;

      jest
        .spyOn(authService, 'exchangeCodeAndUpsertUser')
        .mockResolvedValueOnce({
          user: {
            id: 'e2e-user-id',
            auth0Sub: 'auth0|e2e',
            email: 'e2e@example.com',
            name: 'E2E User',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          isNewUser: true,
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          tokenExpiresAt: Date.now() + 300_000,
          idpHint: null,
        });

      const res = await request(app.getHttpServer())
        .get(`/auth/callback?code=valid-code&state=${oauthState}`)
        .set('Cookie', sid)
        .expect(302);

      expect(res.headers.location).toContain('http://localhost:5173');
      expect(res.headers.location).toContain('isNewUser=true');
      expect(authService.exchangeCodeAndUpsertUser).toHaveBeenCalledWith(
        'valid-code',
        undefined,
      );
    });

    it('should pass idpHint from session to exchangeCodeAndUpsertUser', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          client_redirect_uri: 'http://localhost:5173/',
          idpHint: 'google',
        })
        .expect(200);
      const sid = extractSid(loginRes);

      const loginUrl = new URL(loginRes.body.login_uri);
      const oauthState = loginUrl.searchParams.get('state')!;

      jest
        .spyOn(authService, 'exchangeCodeAndUpsertUser')
        .mockResolvedValueOnce({
          user: {
            id: 'google-user',
            auth0Sub: 'google-oauth2|123',
            email: 'google@example.com',
            name: 'Google User',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          isNewUser: false,
          accessToken: 'google-at',
          refreshToken: 'google-rt',
          tokenExpiresAt: Date.now() + 300_000,
          idpHint: 'google',
        });

      await request(app.getHttpServer())
        .get(`/auth/callback?code=google-code&state=${oauthState}`)
        .set('Cookie', sid)
        .expect(302);

      expect(authService.exchangeCodeAndUpsertUser).toHaveBeenCalledWith(
        'google-code',
        'google',
      );
    });

    it('should redirect to frontend error when exchange fails', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/' })
        .expect(200);
      const sid = extractSid(loginRes);
      const loginUrl = new URL(loginRes.body.login_uri);
      const oauthState = loginUrl.searchParams.get('state')!;

      jest
        .spyOn(authService, 'exchangeCodeAndUpsertUser')
        .mockRejectedValueOnce(new Error('Auth0 unreachable'));

      const res = await request(app.getHttpServer())
        .get(`/auth/callback?code=bad-code&state=${oauthState}`)
        .set('Cookie', sid)
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:5173/auth/error?reason=exchange_failed',
      );
    });
  });

  // ─── Auth: /auth/status ────────────────────────────────────────

  describe('GET /auth/status', () => {
    it('should return authenticated: false without session', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/auth/status')
        .expect(200);

      expect(body).toEqual({ authenticated: false });
    });

    it('should return authenticated: true after successful login', async () => {
      const sid = await performMockLogin();

      const { body } = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);

      expect(body).toEqual({ authenticated: true });
    });
  });

  // ─── Auth: /auth/me ────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('should return 401 without session', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should return user profile with valid session', async () => {
      const sid = await performMockLogin();

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);

      jest.spyOn(authService, 'findUserById').mockResolvedValueOnce({
        id: 'e2e-user-id',
        auth0Sub: 'auth0|e2e',
        email: 'e2e@example.com',
        name: 'E2E User',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      } as User);

      const { body } = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sid)
        .expect(200);

      expect(body.id).toBe('e2e-user-id');
      expect(body.auth0Sub).toBe('auth0|e2e');
      expect(body.email).toBe('e2e@example.com');
      expect(body.name).toBe('E2E User');
      expect(body.isActive).toBe(true);
    });
  });

  // ─── Auth: /auth/logout ────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should return 401 without session', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('should destroy session, clear cookie, and return logout_uri', async () => {
      const sid = await performMockLogin();

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);
      jest.spyOn(authService, 'revokeToken').mockResolvedValueOnce(undefined);

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', sid)
        .expect(200);

      expect(logoutRes.body.success).toBe(true);
      expect(logoutRes.body.logout_uri).toContain(
        'https://tenant.us.auth0.com/v2/logout',
      );
      expect(logoutRes.body.logout_uri).toContain('client_id=client-id');

      const { body } = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);

      expect(body).toEqual({ authenticated: false });
    });

    it('should call revokeToken with the session refresh token', async () => {
      const sid = await performMockLogin();

      const revokeSpy = jest
        .spyOn(authService, 'revokeToken')
        .mockResolvedValueOnce(undefined);
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', sid)
        .expect(200);

      expect(revokeSpy).toHaveBeenCalledWith('mock-rt');
    });
  });

  // ─── Full auth lifecycle ───────────────────────────────────────

  describe('Full auth lifecycle', () => {
    it('login → status → me → logout → status', async () => {
      const statusBefore = await request(app.getHttpServer())
        .get('/auth/status')
        .expect(200);
      expect(statusBefore.body.authenticated).toBe(false);

      const sid = await performMockLogin();

      const statusAfter = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);
      expect(statusAfter.body.authenticated).toBe(true);

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);
      jest.spyOn(authService, 'findUserById').mockResolvedValueOnce({
        id: 'lifecycle-user',
        auth0Sub: 'auth0|lifecycle',
        email: 'lifecycle@test.com',
        name: 'Lifecycle User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sid)
        .expect(200);
      expect(meRes.body.email).toBe('lifecycle@test.com');

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);
      jest.spyOn(authService, 'revokeToken').mockResolvedValueOnce(undefined);

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', sid)
        .expect(200);
      expect(logoutRes.body.success).toBe(true);
      expect(logoutRes.body.logout_uri).toContain('/v2/logout');

      const statusFinal = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);
      expect(statusFinal.body.authenticated).toBe(false);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sid)
        .expect(401);
    });
  });

  // ─── Helper: simulate a complete login via mock ────────────────

  async function performMockLogin(): Promise<string> {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ client_redirect_uri: 'http://localhost:5173/' })
      .expect(200);
    const sid = extractSid(loginRes);
    const loginUrl = new URL(loginRes.body.login_uri);
    const oauthState = loginUrl.searchParams.get('state')!;

    jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValueOnce({
      user: {
        id: 'e2e-user-id',
        auth0Sub: 'auth0|e2e',
        email: 'e2e@example.com',
        name: 'E2E User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isNewUser: false,
      accessToken: 'mock-at',
      refreshToken: 'mock-rt',
      tokenExpiresAt: Date.now() + 300_000,
      idpHint: null,
    });

    const callbackRes = await request(app.getHttpServer())
      .get(`/auth/callback?code=mock-code&state=${oauthState}`)
      .set('Cookie', sid)
      .expect(302);

    return extractSid(callbackRes) || sid;
  }
});
