import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import session = require('express-session');
import { App } from 'supertest/types';
import { jwtVerify } from 'jose';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';
import { createInMemoryRedis, InMemoryRedis } from './in-memory-redis';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { UsersModule } from '../src/users/users.module';
import { UsersService } from '../src/users/users.service';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';
import { KeycloakAdminService } from '../src/keycloak/keycloak-admin.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { Role } from '../src/auth/roles.enum';
import { User } from '../src/users/user.entity';

const TEST_CONFIG: Record<string, unknown> = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://admin:admin@localhost:5432/be-capstone',
  keycloakPublicUrl: 'http://localhost:8080',
  keycloakInternalUrl: 'http://localhost:8080',
  keycloakHealthUrl: 'http://localhost:9000/health/ready',
  keycloakRealm: 'be-capstone',
  keycloakClientId: 'be-capstone-api',
  keycloakClientSecret: 'be-capstone-secret',
  keycloakRedirectUri: 'http://localhost:3000/auth/callback',
  redisUrl: 'redis://localhost:6379',
  sessionSecret: 'e2e-test-secret',
  frontendUrl: 'http://localhost:5173',
  corsOrigin: 'http://localhost:5173',
  keycloakDevAdminUser: 'glowscan-admin',
  keycloakDevAdminPassword: 'admin',
  mobileRedirectUris: ['glowscan://auth/callback'],
  mobileAuthCodeTtlSeconds: 120,
  mobileOauthStateTtlSeconds: 600,
  getMissingRequiredKeys: () => [],
};

describe('Mobile Auth (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let usersService: UsersService;
  let keycloakAdmin: KeycloakAdminService;
  let redis: InMemoryRedis;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    redis = createInMemoryRedis();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        KeycloakAdminModule,
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        UsersModule,
        AuthModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
      ],
      controllers: [AppController, HealthController],
      providers: [AppService, HealthService],
    })
      .overrideProvider(AppConfigService)
      .useValue(TEST_CONFIG)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis)
      .overrideProvider(HealthService)
      .useValue({
        getHealthStatus: () => ({
          status: 'ok',
          timestamp: new Date().toISOString(),
          api: { status: 'up' },
          db: { status: 'up' },
          keycloak: { status: 'up' },
          redis: { status: 'up' },
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
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
    usersService = moduleFixture.get(UsersService);
    keycloakAdmin = moduleFixture.get(KeycloakAdminService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    redis.clear();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const mockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    keycloakSub: 'kc-sub-mobile',
    email: 'mobile@test.com',
    name: 'Mobile User',
    provider: 'keycloak',
    roles: [Role.Customer],
    clinicId: null,
    isActive: true,
  } as unknown as User;

  async function startMobileLogin(idpHint?: string) {
    const body: Record<string, string> = {
      client_redirect_uri: 'glowscan://auth/callback',
    };
    if (idpHint) body.idpHint = idpHint;

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(200);

    const loginUri = new URL(res.body.login_uri);
    return {
      loginUri,
      state: loginUri.searchParams.get('state')!,
      setCookie: res.headers['set-cookie'],
    };
  }

  describe('POST /auth/login (mobile)', () => {
    it('should accept glowscan://auth/callback', async () => {
      const { loginUri, state } = await startMobileLogin();
      expect(loginUri.pathname).toContain('/protocol/openid-connect/auth');
      expect(state).toBeTruthy();
    });

    it('should reject http://evil.com', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://evil.com/' })
        .expect(400);
    });

    it('should reject unknown deep-link URI', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'evil://auth/callback' })
        .expect(400);
    });
  });

  describe('GET /auth/callback (mobile)', () => {
    it('should work without cookie and not put tokens in redirect URL', async () => {
      const { state } = await startMobileLogin();

      jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValue({
        user: mockUser,
        isNewUser: false,
        accessToken: 'ACCESS_TOKEN_SECRET',
        refreshToken: 'REFRESH_TOKEN_SECRET',
        tokenExpiresAt: Date.now() + 900_000,
        idpHint: 'keycloak',
        roles: [Role.Customer],
      });

      const res = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'kc-auth-code', state })
        // intentionally no Cookie header
        .expect(302);

      const location = res.headers.location;
      expect(location.startsWith('glowscan://auth/callback?code=')).toBe(true);
      expect(location).not.toContain('ACCESS_TOKEN_SECRET');
      expect(location).not.toContain('REFRESH_TOKEN_SECRET');
      expect(location).not.toContain('accessToken');
      expect(location).not.toContain('refreshToken');
    });

    it('should reject expired oauth state', async () => {
      const { state } = await startMobileLogin();
      redis.advanceTime(601_000);

      const res = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'kc-auth-code', state })
        .expect(302);

      expect(res.headers.location).toContain('error=state_mismatch');
    });
  });

  describe('POST /auth/mobile/exchange', () => {
    async function completeMobileCallback(): Promise<string> {
      const { state } = await startMobileLogin();
      jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValue({
        user: mockUser,
        isNewUser: true,
        accessToken: 'at-from-exchange',
        refreshToken: 'rt-from-exchange',
        tokenExpiresAt: Date.now() + 900_000,
        idpHint: 'keycloak',
        roles: [Role.Customer],
      });

      const res = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'kc-auth-code', state })
        .expect(302);

      const location = new URL(
        res.headers.location.replace('glowscan://', 'http://'),
      );
      return location.searchParams.get('code')!;
    }

    it('should exchange code once successfully', async () => {
      const code = await completeMobileCallback();
      jest.spyOn(usersService, 'getOwnProfile').mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/auth/mobile/exchange')
        .send({ code })
        .expect(200);

      expect(res.body.accessToken).toBe('at-from-exchange');
      expect(res.body.refreshToken).toBe('rt-from-exchange');
      expect(res.body.expiresIn).toBeGreaterThan(0);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user.id).toBe(mockUser.id);
    });

    it('should return 401 when exchanging the same code again', async () => {
      const code = await completeMobileCallback();
      jest.spyOn(usersService, 'getOwnProfile').mockResolvedValue(mockUser);

      await request(app.getHttpServer())
        .post('/auth/mobile/exchange')
        .send({ code })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/mobile/exchange')
        .send({ code })
        .expect(401);
    });

    it('should reject expired mobile code', async () => {
      const code = await completeMobileCallback();
      redis.advanceTime(121_000);

      await request(app.getHttpServer())
        .post('/auth/mobile/exchange')
        .send({ code })
        .expect(401);
    });
  });

  describe('Bearer token on protected API', () => {
    it('should allow GET /users/me with Bearer access token', async () => {
      const { state } = await startMobileLogin();
      jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValue({
        user: mockUser,
        isNewUser: false,
        accessToken: 'bearer-access-token',
        refreshToken: 'bearer-refresh-token',
        tokenExpiresAt: Date.now() + 900_000,
        idpHint: 'keycloak',
        roles: [Role.Customer],
      });

      const callbackRes = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'kc-auth-code', state })
        .expect(302);

      const location = new URL(
        callbackRes.headers.location.replace('glowscan://', 'http://'),
      );
      const code = location.searchParams.get('code')!;
      jest.spyOn(usersService, 'getOwnProfile').mockResolvedValue(mockUser);

      const exchange = await request(app.getHttpServer())
        .post('/auth/mobile/exchange')
        .send({ code })
        .expect(200);

      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: mockUser.keycloakSub,
          realm_access: { roles: ['customer'] },
        },
      });
      jest.spyOn(usersService, 'findByKeycloakSub').mockResolvedValue(mockUser);

      const me = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${exchange.body.accessToken}`)
        .expect(200);

      expect(me.body.id).toBe(mockUser.id);
    });
  });

  describe('POST /auth/mobile/login', () => {
    const loginResponse = {
      accessToken: 'direct-access-token',
      refreshToken: 'direct-refresh-token',
      expiresIn: 900,
      user: mockUser,
      isNewUser: false,
    };

    it('should login with valid credentials', async () => {
      jest
        .spyOn(authService, 'loginWithPassword')
        .mockResolvedValue(loginResponse);

      const res = await request(app.getHttpServer())
        .post('/auth/mobile/login')
        .send({ username: 'mobile@test.com', password: 'password123' })
        .expect(200);

      expect(res.body.accessToken).toBe('direct-access-token');
      expect(res.body.refreshToken).toBe('direct-refresh-token');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user.id).toBe(mockUser.id);
      expect(res.body.isNewUser).toBe(false);
    });

    it('should return 401 for invalid credentials', async () => {
      jest
        .spyOn(authService, 'loginWithPassword')
        .mockRejectedValue(
          new UnauthorizedException('Invalid username or password'),
        );

      await request(app.getHttpServer())
        .post('/auth/mobile/login')
        .send({ username: 'mobile@test.com', password: 'wrong' })
        .expect(401);
    });

    it('should return 400 when username is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/mobile/login')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/mobile/login')
        .send({ username: 'mobile@test.com' })
        .expect(400);
    });
  });

  describe('POST /auth/mobile/register', () => {
    const registerResponse = {
      accessToken: 'reg-access-token',
      refreshToken: 'reg-refresh-token',
      expiresIn: 900,
      user: { ...mockUser, email: 'newuser@test.com' } as unknown as User,
      isNewUser: true,
    };

    it('should register a new user', async () => {
      jest
        .spyOn(keycloakAdmin, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest
        .spyOn(keycloakAdmin, 'createUser')
        .mockResolvedValue('new-kc-user-id');
      jest
        .spyOn(authService, 'loginWithPassword')
        .mockResolvedValue(registerResponse);

      const res = await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({
          email: 'newuser@test.com',
          password: 'password123',
          name: 'New User',
        })
        .expect(200);

      expect(res.body.accessToken).toBe('reg-access-token');
      expect(res.body.isNewUser).toBe(true);
      expect(keycloakAdmin.createUser).toHaveBeenCalledWith(
        'admin-token',
        expect.objectContaining({
          username: 'newuser@test.com',
          email: 'newuser@test.com',
          firstName: 'New',
          lastName: 'User',
          enabled: true,
          emailVerified: false,
          credentials: [
            { type: 'password', value: 'password123', temporary: false },
          ],
        }),
      );
    });

    it('should return 409 when email already exists', async () => {
      jest
        .spyOn(keycloakAdmin, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest
        .spyOn(keycloakAdmin, 'createUser')
        .mockRejectedValue(new ConflictException('Email already registered'));

      await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ email: 'dup@test.com', password: 'password123' })
        .expect(409);
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ email: 'valid@test.com', password: 'short' })
        .expect(400);
    });
  });

  describe('Bearer token via direct login', () => {
    it('should allow GET /users/me with token from POST /auth/mobile/login', async () => {
      jest.spyOn(authService, 'loginWithPassword').mockResolvedValue({
        accessToken: 'direct-bearer-token',
        refreshToken: 'direct-refresh-token',
        expiresIn: 900,
        user: mockUser,
        isNewUser: false,
      });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/mobile/login')
        .send({ username: 'mobile@test.com', password: 'password123' })
        .expect(200);

      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: mockUser.keycloakSub,
          realm_access: { roles: ['customer'] },
        },
      });
      jest.spyOn(usersService, 'findByKeycloakSub').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'getOwnProfile').mockResolvedValue(mockUser);

      const me = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(me.body.id).toBe(mockUser.id);
    });
  });

  describe('Web flow regression', () => {
    it('should still accept SPA client_redirect_uri and set session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ client_redirect_uri: 'http://localhost:5173/after-login' })
        .expect(200);

      expect(res.body.login_uri).toContain('/protocol/openid-connect/auth');
      const cookies = res.headers['set-cookie'];
      const cookieList = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieList.some((c: string) => c?.startsWith('sid='))).toBe(true);
    });
  });
});
