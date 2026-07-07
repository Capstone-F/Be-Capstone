import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import session = require('express-session');
import { DataSource } from 'typeorm';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UsersModule } from '../src/users/users.module';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { User } from '../src/users/user.entity';
import { Clinic } from '../src/clinics/clinic.entity';
import { Product } from '../src/products/product.entity';
import { ProductBrand } from '../src/products/product-brand.entity';
import { ProductCategory } from '../src/products/product-category.entity';
import { ProductVariant } from '../src/products/product-variant.entity';
import { ProductIngredient } from '../src/products/product-ingredient.entity';
import { Ingredient } from '../src/ingredients/ingredient.entity';
import { IngredientProtocol } from '../src/ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../src/ingredients/protocol-label.entity';
import { ProtocolSkinType } from '../src/ingredients/protocol-skin-type.entity';
import {
  LabelMatchType,
  SkinTypeRecommendation,
  TimeOfUse,
} from '../src/ingredients/enums';
import { Label } from '../src/survey/label.entity';
import { LabelCategory } from '../src/survey/label-category.entity';
import { CustomerSurvey } from '../src/survey/customer-survey.entity';
import { Customer } from '../src/users/customer.entity';
import { Expert } from '../src/users/expert.entity';
import { ExpertSpecialty } from '../src/experts/expert-specialty.enum';
import { CustomerSkinTypeDetails } from '../src/users/customer-skin-type-details.entity';
import { SkinType } from '../src/users/skin-type.entity';
import {
  OilyDry,
  PigmentedNonPigmented,
  SensitiveResistant,
  WrinkledTight,
} from '../src/users/skin-type.enums';
import { StockModule } from '../src/stock/stock.module';
import { ProductsModule } from '../src/products/products.module';
import { ExpertsModule } from '../src/experts/experts.module';
import { BookingsModule } from '../src/bookings/bookings.module';
import { ExpertAvailability } from '../src/bookings/expert-availability.entity';
import { ConsultationRequest } from '../src/consultations/consultation-request.entity';
import { ConsultationStatus } from '../src/consultations/enums';
import { StockBatch } from '../src/stock/stock-batch.entity';
import { StockMovement } from '../src/stock/stock-movement.entity';
import { ProductInstance } from '../src/stock/product-instance.entity';
import {
  ProductInstanceStatus,
  ShelfLifeUnit,
  StockMovementType,
} from '../src/stock/enums';
import { StockService } from '../src/stock/stock.service';
import { Order } from '../src/commerce/order.entity';
import { OrderItem } from '../src/commerce/order-item.entity';
import { OrderStatus } from '../src/commerce/enums';
import { Role } from '../src/auth/roles.enum';
import { KeycloakAdminService } from '../src/keycloak/keycloak-admin.service';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';

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
  let authController: AuthController;
  let stockService: StockService;
  let keycloakAdminService: KeycloakAdminService;
  let dataSource: DataSource;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        KeycloakAdminModule,
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        UsersModule,
        AuthModule,
        StockModule,
        ProductsModule,
        ExpertsModule,
        BookingsModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
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
    authController = moduleFixture.get(AuthController);
    stockService = moduleFixture.get(StockService);
    keycloakAdminService = moduleFixture.get(KeycloakAdminService);
    dataSource = moduleFixture.get(DataSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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
      expect(body.keycloak).toEqual({ status: 'up' });
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
      expect(loginUri.pathname).toContain('/protocol/openid-connect/auth');
      expect(loginUri.searchParams.get('client_id')).toBe('be-capstone-api');
      expect(loginUri.searchParams.get('response_type')).toBe('code');
      expect(loginUri.searchParams.get('state')).toBeTruthy();
      expect(extractSid(res)).toBeTruthy();
    });

    it('should include kc_idp_hint in login_uri when idpHint is in body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          client_redirect_uri: 'http://localhost:5173/',
          idpHint: 'google',
        })
        .expect(200);

      expect(new URL(res.body.login_uri).searchParams.get('kc_idp_hint')).toBe(
        'google',
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
            keycloakSub: 'kc-sub-e2e',
            email: 'e2e@example.com',
            name: 'E2E User',
            provider: 'keycloak',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          isNewUser: false,
          accessToken: 'at',
          refreshToken: 'rt',
          tokenExpiresAt: Date.now() + 300_000,
          idpHint: 'keycloak',
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
            keycloakSub: 'kc-sub-e2e',
            email: 'e2e@example.com',
            name: 'E2E User',
            provider: 'keycloak',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          isNewUser: true,
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          tokenExpiresAt: Date.now() + 300_000,
          idpHint: 'keycloak',
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
            keycloakSub: 'kc-google',
            email: 'google@example.com',
            name: 'Google User',
            provider: 'google',
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

      const loggerError = jest
        .spyOn(authController['logger'], 'error')
        .mockImplementation(() => undefined);

      jest
        .spyOn(authService, 'exchangeCodeAndUpsertUser')
        .mockRejectedValueOnce(new Error('OAuth token exchange failed'));

      const res = await request(app.getHttpServer())
        .get(`/auth/callback?code=bad-code&state=${oauthState}`)
        .set('Cookie', sid)
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:5173/auth/error?reason=exchange_failed',
      );
      expect(loggerError).toHaveBeenCalledWith(
        'OAuth callback failed',
        expect.any(Error),
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

  // ─── Users: GET /users/me ────────────────────────────────────────

  describe('GET /users/me', () => {
    it('should return 401 without session', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('should return user profile with valid session', async () => {
      const user = await seedUser({
        keycloakSub: 'kc-sub-e2e',
        email: 'e2e@example.com',
        name: 'E2E User',
        roles: [Role.Customer],
      });
      const sid = await performMockLogin({
        userId: user.id,
        keycloakSub: user.keycloakSub,
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      });

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);

      const { body } = await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', sid)
        .expect(200);

      expect(body.id).toBe(user.id);
      expect(body.email).toBe('e2e@example.com');
      expect(body.name).toBe('E2E User');
      expect(body.provider).toBe('keycloak');
      expect(body.isActive).toBe(true);
    });
  });

  // ─── Auth: /auth/logout ────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should return 401 without session', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('should destroy session and clear cookie', async () => {
      const sid = await performMockLogin();

      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);
      jest.spyOn(authService, 'revokeToken').mockResolvedValueOnce(undefined);

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', sid)
        .expect(200);

      expect(logoutRes.body).toEqual({ success: true });

      // Session should be destroyed
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
      // 1. Not authenticated
      const statusBefore = await request(app.getHttpServer())
        .get('/auth/status')
        .expect(200);
      expect(statusBefore.body.authenticated).toBe(false);

      // 2. Login → get session
      const lifecycleUser = await seedUser({
        keycloakSub: 'kc-lifecycle',
        email: 'lifecycle@test.com',
        name: 'Lifecycle User',
        roles: [Role.Customer],
      });
      const sid = await performMockLogin({
        userId: lifecycleUser.id,
        keycloakSub: lifecycleUser.keycloakSub,
        email: lifecycleUser.email ?? undefined,
        name: lifecycleUser.name ?? undefined,
      });

      // 3. Authenticated
      const statusAfter = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);
      expect(statusAfter.body.authenticated).toBe(true);

      // 4. Get profile
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);

      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', sid)
        .expect(200);
      expect(meRes.body.email).toBe('lifecycle@test.com');

      // 5. Logout
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValueOnce(undefined);
      jest.spyOn(authService, 'revokeToken').mockResolvedValueOnce(undefined);

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', sid)
        .expect(200);
      expect(logoutRes.body).toEqual({ success: true });

      // 6. No longer authenticated
      const statusFinal = await request(app.getHttpServer())
        .get('/auth/status')
        .set('Cookie', sid)
        .expect(200);
      expect(statusFinal.body.authenticated).toBe(false);

      // 7. /users/me returns 401 again
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', sid)
        .expect(401);
    });
  });

  // ─── Users: RBAC + user management ───────────────────────────────

  describe('Users module endpoints', () => {
    it('GET /users should return 403 for customer role', async () => {
      const sid = await performMockLogin({
        userId: 'customer-session-user',
        keycloakSub: 'kc-customer-session',
        roles: [Role.Customer],
      });

      await request(app.getHttpServer())
        .get('/users')
        .set('Cookie', sid)
        .expect(403);
    });

    it('GET /users should return paginated list for app_admin', async () => {
      const sid = await performMockLogin({
        userId: 'admin-session-user',
        keycloakSub: 'kc-admin-session',
        roles: [Role.AppAdmin],
      });
      await seedUser({
        keycloakSub: 'kc-list-1',
        email: 'list1@example.com',
        name: 'List User 1',
        roles: [Role.Customer],
      });
      await seedUser({
        keycloakSub: 'kc-list-2',
        email: 'list2@example.com',
        name: 'List User 2',
        roles: [Role.Staff],
      });

      const { body } = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .set('Cookie', sid)
        .expect(200);

      expect(body.total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('GET /users should scope clinic_manager to own clinic', async () => {
      const clinicA = await seedClinic('Clinic A');
      const clinicB = await seedClinic('Clinic B');
      const sid = await performMockLogin({
        userId: 'manager-session-user',
        keycloakSub: 'kc-manager-session',
        roles: [Role.ClinicManager],
        clinicId: clinicA.id,
      });

      await seedUser({
        keycloakSub: 'kc-expert-a',
        email: 'expert-a@example.com',
        name: 'Expert A',
        roles: [Role.Expert],
        clinicId: clinicA.id,
      });
      await seedUser({
        keycloakSub: 'kc-expert-b',
        email: 'expert-b@example.com',
        name: 'Expert B',
        roles: [Role.Expert],
        clinicId: clinicB.id,
      });

      const { body } = await request(app.getHttpServer())
        .get('/users')
        .set('Cookie', sid)
        .expect(200);

      const clinics = new Set(
        (body.items as Array<{ clinicId: string }>).map((u) => u.clinicId),
      );
      expect(clinics.size).toBeLessThanOrEqual(1);
      expect(clinics.has(clinicA.id)).toBe(true);
    });

    it('PATCH /users/me should update own name', async () => {
      const self = await seedUser({
        keycloakSub: 'kc-self-1',
        email: 'self@example.com',
        name: 'Old Name',
        roles: [Role.Customer],
      });
      const sid = await performMockLogin({
        userId: self.id,
        keycloakSub: self.keycloakSub,
        roles: [Role.Customer],
      });

      jest
        .spyOn(keycloakAdminService, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest.spyOn(keycloakAdminService, 'updateUser').mockResolvedValue();

      const { body } = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Cookie', sid)
        .send({ name: 'New Self Name' })
        .expect(200);

      expect(body.name).toBe('New Self Name');
    });

    it('POST /users should allow app_admin to create staff', async () => {
      const sid = await performMockLogin({
        userId: 'admin-create-user',
        keycloakSub: 'kc-admin-create-user',
        roles: [Role.AppAdmin],
      });

      jest
        .spyOn(keycloakAdminService, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest
        .spyOn(keycloakAdminService, 'createUser')
        .mockResolvedValue('kc-new-staff');
      jest
        .spyOn(keycloakAdminService, 'getRealmRole')
        .mockResolvedValue({ id: 'role-staff', name: Role.Staff });
      jest.spyOn(keycloakAdminService, 'assignRealmRoles').mockResolvedValue();

      const { body } = await request(app.getHttpServer())
        .post('/users')
        .set('Cookie', sid)
        .send({
          email: 'new-staff@example.com',
          name: 'New Staff',
          role: Role.Staff,
          temporaryPassword: 'Temp123!',
        })
        .expect(201);

      expect(body.keycloakSub).toBe('kc-new-staff');
      expect(body.roles).toEqual([Role.Staff]);
    });

    it('POST /users should reject clinic_manager creating staff', async () => {
      const clinic = await seedClinic('Forbidden Create Clinic');
      const sid = await performMockLogin({
        userId: 'manager-create-staff',
        keycloakSub: 'kc-manager-create-staff',
        roles: [Role.ClinicManager],
        clinicId: clinic.id,
      });

      await request(app.getHttpServer())
        .post('/users')
        .set('Cookie', sid)
        .send({
          email: 'not-allowed@example.com',
          name: 'Not Allowed',
          role: Role.Staff,
          temporaryPassword: 'Temp123!',
        })
        .expect(403);
    });

    it('PATCH /users/:id/roles should update target roles for app_admin', async () => {
      const sid = await performMockLogin({
        userId: 'admin-assign-role',
        keycloakSub: 'kc-admin-assign-role',
        roles: [Role.AppAdmin],
      });
      const target = await seedUser({
        keycloakSub: 'kc-target-role',
        email: 'target-role@example.com',
        name: 'Target Role User',
        roles: [Role.Customer],
      });

      jest
        .spyOn(keycloakAdminService, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest
        .spyOn(keycloakAdminService, 'replaceUserAppRoles')
        .mockResolvedValue();
      jest.spyOn(keycloakAdminService, 'setUserAttributes').mockResolvedValue();

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${target.id}/roles`)
        .set('Cookie', sid)
        .send({ roles: [Role.Staff] })
        .expect(200);

      expect(body.roles).toEqual([Role.Staff]);
    });

    it('PATCH /users/:id/status should enable/disable target user for app_admin', async () => {
      const sid = await performMockLogin({
        userId: 'admin-status-user',
        keycloakSub: 'kc-admin-status-user',
        roles: [Role.AppAdmin],
      });
      const target = await seedUser({
        keycloakSub: 'kc-target-status',
        email: 'target-status@example.com',
        name: 'Target Status User',
        roles: [Role.Customer],
        isActive: true,
      });

      jest
        .spyOn(keycloakAdminService, 'getAdminToken')
        .mockResolvedValue('admin-token');
      jest.spyOn(keycloakAdminService, 'setUserEnabled').mockResolvedValue();

      const { body } = await request(app.getHttpServer())
        .patch(`/users/${target.id}/status`)
        .set('Cookie', sid)
        .send({ isActive: false })
        .expect(200);

      expect(body.isActive).toBe(false);
    });
  });

  // ─── Products module endpoints ─────────────────────────────────

  describe('Products module endpoints', () => {
    const makeBaseOnboardPayload = () => ({
      name: 'La Roche-Posay Effaclar Serum',
      brand: 'La Roche-Posay',
      categoryCode: 'SERUM',
      categoryName: 'Serum',
      sku: `LRP-EFFAC-${Math.random().toString(36).slice(2, 8)}`,
      priceVnd: 650000,
      shelfLifeValue: 365,
      shelfLifeUnit: ShelfLifeUnit.DAY,
      ingredients: [
        {
          name: 'Salicylic Acid',
          concentrationPct: 1.5,
          isKeyIngredient: true,
        },
        { name: 'Niacinamide', concentrationPct: 2 },
      ],
    });

    let adminSid: string;

    beforeEach(async () => {
      adminSid = await performMockLogin({
        userId: 'admin-products-e2e',
        keycloakSub: 'kc-admin-products-e2e',
        roles: [Role.AppAdmin],
      });
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValue(undefined);
    });

    describe('POST /products', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer())
          .post('/products')
          .send(makeBaseOnboardPayload())
          .expect(401);
      });

      it('should return 403 for customer role', async () => {
        const customerSid = await performMockLogin({
          userId: 'customer-products-e2e',
          keycloakSub: 'kc-customer-products-e2e',
          roles: [Role.Customer],
        });

        await request(app.getHttpServer())
          .post('/products')
          .set('Cookie', customerSid)
          .send(makeBaseOnboardPayload())
          .expect(403);
      });

      it('should onboard product as app_admin with auto-created ingredients', async () => {
        const payload = makeBaseOnboardPayload();
        const { body } = await request(app.getHttpServer())
          .post('/products')
          .set('Cookie', adminSid)
          .send(payload)
          .expect(201);

        expect(body.product.name).toBe(payload.name);
        expect(body.product.brandName).toBe(payload.brand);
        expect(body.product.categoryName).toBe('Serum');
        expect(body.product.variants[0].priceVnd).toBe(650000);
        expect(body.product.variants[0].sku).toBe(payload.sku);
        expect(body.ingredients).toHaveLength(2);
        expect(body.ingredients).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Salicylic Acid',
              concentrationPct: 1.5,
              isKeyIngredient: true,
            }),
            expect.objectContaining({
              name: 'Niacinamide',
              concentrationPct: 2,
              isKeyIngredient: false,
            }),
          ]),
        );

        const mappings = await dataSource
          .getRepository(ProductIngredient)
          .find({ where: { productId: body.product.id } });
        expect(mappings).toHaveLength(2);

        const ingredients = await dataSource.getRepository(Ingredient).find();
        const names = ingredients.map((i) => i.name);
        expect(names).toEqual(
          expect.arrayContaining(['Salicylic Acid', 'Niacinamide']),
        );
      });

      it('should deduplicate ingredient names for staff role', async () => {
        const staffSid = await performMockLogin({
          userId: 'staff-products-e2e',
          keycloakSub: 'kc-staff-products-e2e',
          roles: [Role.Staff],
        });

        const { body } = await request(app.getHttpServer())
          .post('/products')
          .set('Cookie', staffSid)
          .send({
            ...makeBaseOnboardPayload(),
            name: 'Dedup Test Serum',
            ingredients: [
              { name: 'Niacinamide', concentrationPct: 2 },
              { name: 'niacinamide', concentrationPct: 5 },
            ],
          })
          .expect(201);

        expect(body.ingredients).toHaveLength(1);
        expect(body.ingredients[0].name).toBe('Niacinamide');

        const mappings = await dataSource
          .getRepository(ProductIngredient)
          .find({ where: { productId: body.product.id } });
        expect(mappings).toHaveLength(1);
      });

      it('should return 400 for invalid payload', async () => {
        await request(app.getHttpServer())
          .post('/products')
          .set('Cookie', adminSid)
          .send({
            brand: 'La Roche-Posay',
            categoryCode: 'SERUM',
            priceVnd: 650000,
            ingredients: [{ name: 'Niacinamide' }],
          })
          .expect(400);
      });
    });

    describe('GET /products', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer()).get('/products').expect(401);
      });

      it('should return paginated products for authenticated user', async () => {
        await onboardProductViaHttp(adminSid);

        const { body } = await request(app.getHttpServer())
          .get('/products?page=1&limit=10')
          .set('Cookie', adminSid)
          .expect(200);

        expect(body.total).toBeGreaterThanOrEqual(1);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(10);
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items[0]).toHaveProperty('product');
        expect(body.items[0]).toHaveProperty('ingredients');
      });

      it('should filter products by category', async () => {
        const serum = await onboardProductViaHttp(adminSid, {
          name: 'Serum Product',
          categoryCode: 'SERUM',
          categoryName: 'Serum',
          sku: 'SERUM-FILTER-E2E',
        });
        await onboardProductViaHttp(adminSid, {
          name: 'Moisturizer Product',
          categoryCode: 'MOISTURIZER',
          categoryName: 'Moisturizer',
          sku: 'MOIST-FILTER-E2E',
        });

        const { body } = await request(app.getHttpServer())
          .get(`/products?categoryId=${serum.product.categoryId}`)
          .set('Cookie', adminSid)
          .expect(200);

        expect(body.items.length).toBeGreaterThanOrEqual(1);
        for (const item of body.items) {
          expect(item.product.categoryId).toBe(serum.product.categoryId);
        }
      });
    });

    describe('GET /products/:id', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer())
          .get('/products/00000000-0000-0000-0000-000000000001')
          .expect(401);
      });

      it('should return 404 when product does not exist', async () => {
        await request(app.getHttpServer())
          .get('/products/00000000-0000-0000-0000-000000000099')
          .set('Cookie', adminSid)
          .expect(404);
      });

      it('should return product detail with ingredients', async () => {
        const onboarded = await onboardProductViaHttp(adminSid);

        const { body } = await request(app.getHttpServer())
          .get(`/products/${onboarded.product.id}`)
          .set('Cookie', adminSid)
          .expect(200);

        expect(body.product.id).toBe(onboarded.product.id);
        expect(body.product.name).toBe(onboarded.product.name);
        expect(body.ingredients).toHaveLength(2);
        expect(body.ingredients[0]).toHaveProperty('name');
        expect(body.ingredients[0]).toHaveProperty('concentrationPct');
        expect(body.ingredients[0]).toHaveProperty('isKeyIngredient');
      });
    });
  });

  // ─── Experts module endpoints ─────────────────────────────────

  describe('Experts module endpoints', () => {
    let customerSid: string;

    beforeEach(async () => {
      customerSid = await performMockLogin({
        userId: 'customer-experts-e2e',
        keycloakSub: 'kc-customer-experts-e2e',
        roles: [Role.Customer],
      });
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValue(undefined);
    });

    async function seedExpert(
      overrides: {
        name?: string;
        email?: string;
        specialization?: ExpertSpecialty;
        rating?: number;
        consultationFee?: number;
        clinicName?: string;
        latitude?: number | null;
        longitude?: number | null;
        isActive?: boolean;
      } = {},
    ): Promise<Expert> {
      const clinic = await dataSource.getRepository(Clinic).save(
        dataSource.getRepository(Clinic).create({
          name:
            overrides.clinicName ??
            `Clinic ${Math.random().toString(36).slice(2, 6)}`,
          address: 'E2E Address',
          latitude: overrides.latitude ?? null,
          longitude: overrides.longitude ?? null,
        }),
      );

      const user = await seedUser({
        keycloakSub: `kc-expert-${Math.random().toString(36).slice(2)}`,
        email: overrides.email ?? 'expert@example.com',
        name: overrides.name ?? 'Dr. Expert',
        roles: [Role.Expert],
        clinicId: clinic.id,
      });

      return dataSource.getRepository(Expert).save(
        dataSource.getRepository(Expert).create({
          userId: user.id,
          clinicId: clinic.id,
          specialization:
            overrides.specialization ?? ExpertSpecialty.DERMATOLOGY,
          licenseNumber: 'LIC-E2E',
          bio: 'E2E expert bio',
          rating: overrides.rating ?? 4.5,
          consultationFee: overrides.consultationFee ?? 300000,
          isActive: overrides.isActive ?? true,
        }),
      );
    }

    describe('GET /experts', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer()).get('/experts').expect(401);
      });

      it('should return paginated experts for authenticated user', async () => {
        await seedExpert({ name: 'Dr. A' });
        await seedExpert({ name: 'Dr. B' });

        const { body } = await request(app.getHttpServer())
          .get('/experts?page=1&limit=10')
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.total).toBeGreaterThanOrEqual(2);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(10);
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items[0]).toHaveProperty('id');
        expect(body.items[0]).toHaveProperty('name');
        expect(body.items[0]).toHaveProperty('rating');
        expect(body.items[0]).toHaveProperty('consultationFee');
      });

      it('should filter by specialization', async () => {
        await seedExpert({
          name: 'Derma Expert',
          specialization: ExpertSpecialty.DERMATOLOGY,
        });
        await seedExpert({
          name: 'Cosmetic Expert',
          specialization: ExpertSpecialty.COSMETIC_DERMATOLOGY,
        });

        const { body } = await request(app.getHttpServer())
          .get(`/experts?specialization=${ExpertSpecialty.DERMATOLOGY}`)
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.items.length).toBeGreaterThanOrEqual(1);
        for (const item of body.items) {
          expect(item.specialization).toBe(ExpertSpecialty.DERMATOLOGY);
        }
      });

      it('should reject an invalid (free-text) specialization', async () => {
        await request(app.getHttpServer())
          .get('/experts?specialization=not-a-real-specialty')
          .set('Cookie', customerSid)
          .expect(400);
      });

      it('should filter by minRating', async () => {
        await seedExpert({ name: 'High Rated', rating: 4.8 });
        await seedExpert({ name: 'Low Rated', rating: 2.5 });

        const { body } = await request(app.getHttpServer())
          .get('/experts?minRating=4')
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.items.length).toBeGreaterThanOrEqual(1);
        for (const item of body.items) {
          expect(item.rating).toBeGreaterThanOrEqual(4);
        }
      });

      it('should filter by minFee and maxFee', async () => {
        await seedExpert({
          name: 'Affordable',
          consultationFee: 150000,
        });
        await seedExpert({
          name: 'Premium',
          consultationFee: 800000,
        });

        const { body } = await request(app.getHttpServer())
          .get('/experts?minFee=100000&maxFee=500000')
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.items.length).toBeGreaterThanOrEqual(1);
        for (const item of body.items) {
          expect(item.consultationFee).toBeGreaterThanOrEqual(100000);
          expect(item.consultationFee).toBeLessThanOrEqual(500000);
        }
      });

      it('should filter and sort by distance using clinic coordinates', async () => {
        const clientLat = 10.7769;
        const clientLng = 106.7009;

        await seedExpert({
          name: 'Near Expert',
          clinicName: 'Near Clinic',
          latitude: 10.777,
          longitude: 106.701,
        });
        await seedExpert({
          name: 'Far Expert',
          clinicName: 'Far Clinic',
          latitude: 21.0285,
          longitude: 105.8542,
        });

        const { body } = await request(app.getHttpServer())
          .get(
            `/experts?lat=${clientLat}&lng=${clientLng}&radiusKm=50&page=1&limit=10`,
          )
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.items[0].name).toBe('Near Expert');
        expect(body.items[0].distanceKm).not.toBeNull();
        expect(body.items[0].distanceKm).toBeLessThan(50);
        for (const item of body.items) {
          expect(item.distanceKm).toBeLessThanOrEqual(50);
        }
      });
    });

    describe('GET /experts/:id', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer())
          .get('/experts/00000000-0000-0000-0000-000000000001')
          .expect(401);
      });

      it('should return 404 when expert does not exist', async () => {
        await request(app.getHttpServer())
          .get('/experts/00000000-0000-0000-0000-000000000099')
          .set('Cookie', customerSid)
          .expect(404);
      });

      it('should return expert detail for valid id', async () => {
        const expert = await seedExpert({
          name: 'Detail Expert',
          specialization: ExpertSpecialty.ACNE_TREATMENT,
          consultationFee: 250000,
        });

        const { body } = await request(app.getHttpServer())
          .get(`/experts/${expert.id}`)
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.id).toBe(expert.id);
        expect(body.name).toBe('Detail Expert');
        expect(body.specialization).toBe(ExpertSpecialty.ACNE_TREATMENT);
        expect(body.consultationFee).toBe(250000);
        expect(body.rating).toBe(4.5);
        expect(body.clinicName).toBeTruthy();
      });
    });
  });

  // ─── Bookings module endpoints ──────────────────────────────────

  describe('Bookings module endpoints', () => {
    let customerSid: string;

    beforeEach(async () => {
      customerSid = await performMockLogin({
        userId: 'customer-bookings-e2e',
        keycloakSub: 'kc-customer-bookings-e2e',
        roles: [Role.Customer],
      });
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValue(undefined);
    });

    async function seedExpertForBookings(
      overrides: {
        name?: string;
        sessionLengthHours?: number;
        isActive?: boolean;
      } = {},
    ): Promise<Expert> {
      const clinic = await dataSource.getRepository(Clinic).save(
        dataSource.getRepository(Clinic).create({
          name: `Booking Clinic ${Math.random().toString(36).slice(2, 6)}`,
          address: 'E2E Address',
        }),
      );

      const user = await seedUser({
        keycloakSub: `kc-booking-expert-${Math.random().toString(36).slice(2)}`,
        email: 'booking-expert@example.com',
        name: overrides.name ?? 'Dr. Booking Expert',
        roles: [Role.Expert],
        clinicId: clinic.id,
      });

      return dataSource.getRepository(Expert).save(
        dataSource.getRepository(Expert).create({
          userId: user.id,
          clinicId: clinic.id,
          specialization: ExpertSpecialty.DERMATOLOGY,
          licenseNumber: 'LIC-BOOKING',
          bio: 'Booking e2e expert',
          rating: 4.5,
          consultationFee: 300000,
          sessionLengthHours: overrides.sessionLengthHours ?? 2,
          isActive: overrides.isActive ?? true,
        }),
      );
    }

    async function seedAvailability(
      expertId: string,
      blocks: Array<{ dayOfWeek: number; startHour: number; endHour: number }>,
    ): Promise<void> {
      const repo = dataSource.getRepository(ExpertAvailability);
      for (const block of blocks) {
        await repo.save(
          repo.create({
            expertId,
            dayOfWeek: block.dayOfWeek,
            startHour: block.startHour,
            endHour: block.endHour,
          }),
        );
      }
    }

    async function seedConsultation(options: {
      expertId: string;
      scheduledAt: Date;
      status?: ConsultationStatus;
    }): Promise<ConsultationRequest> {
      const user = await seedUser({
        keycloakSub: `kc-booking-customer-${Math.random().toString(36).slice(2)}`,
        email: 'booking-customer@example.com',
        name: 'Booking Customer',
        roles: [Role.Customer],
      });
      const customer = await dataSource
        .getRepository(Customer)
        .save(dataSource.getRepository(Customer).create({ userId: user.id }));

      return dataSource.getRepository(ConsultationRequest).save(
        dataSource.getRepository(ConsultationRequest).create({
          customerId: customer.id,
          expertId: options.expertId,
          reason: 'E2E booking',
          status: options.status ?? ConsultationStatus.CONFIRMED,
          scheduledAt: options.scheduledAt,
        }),
      );
    }

    describe('GET /bookings/:expertId', () => {
      it('should return 401 without session cookie', async () => {
        await request(app.getHttpServer())
          .get('/bookings/00000000-0000-0000-0000-000000000001')
          .expect(401);
      });

      it('should return 404 when expert does not exist', async () => {
        await request(app.getHttpServer())
          .get('/bookings/00000000-0000-0000-0000-000000000099')
          .set('Cookie', customerSid)
          .expect(404);
      });

      it('should return hourly-stepped slots spanning sessionLengthHours', async () => {
        const expert = await seedExpertForBookings({ sessionLengthHours: 2 });
        await seedAvailability(expert.id, [
          { dayOfWeek: 2, startHour: 9, endHour: 18 },
        ]);

        const { body } = await request(app.getHttpServer())
          .get(`/bookings/${expert.id}?date=2026-07-07`)
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.expertId).toBe(expert.id);
        expect(body.sessionLengthHours).toBe(2);
        expect(body.range).toBe('week');
        expect(body.from).toBe('2026-07-06');
        expect(body.to).toBe('2026-07-12');

        const tuesday = body.days.find(
          (d: { date: string }) => d.date === '2026-07-07',
        );
        expect(tuesday).toBeDefined();
        expect(tuesday.slots).toHaveLength(8);
        expect(
          tuesday.slots.every((s: { available: boolean }) => s.available),
        ).toBe(true);
        expect(new Date(tuesday.slots[0].startAt).getUTCHours()).toBe(9);
        expect(new Date(tuesday.slots[0].endAt).getUTCHours()).toBe(11);
      });

      it('should return month range when range=month', async () => {
        const expert = await seedExpertForBookings({ sessionLengthHours: 1 });

        const { body } = await request(app.getHttpServer())
          .get(`/bookings/${expert.id}?date=2026-07-15&range=month`)
          .set('Cookie', customerSid)
          .expect(200);

        expect(body.range).toBe('month');
        expect(body.from).toBe('2026-07-01');
        expect(body.to).toBe('2026-07-31');
        expect(body.days).toHaveLength(31);
      });

      it('should mark overlapping candidate starts unavailable when booked at 10:00', async () => {
        const expert = await seedExpertForBookings({ sessionLengthHours: 2 });
        await seedAvailability(expert.id, [
          { dayOfWeek: 2, startHour: 9, endHour: 18 },
        ]);
        await seedConsultation({
          expertId: expert.id,
          scheduledAt: new Date('2026-07-07T10:00:00.000Z'),
        });

        const { body } = await request(app.getHttpServer())
          .get(`/bookings/${expert.id}?date=2026-07-07`)
          .set('Cookie', customerSid)
          .expect(200);

        const tuesday = body.days.find(
          (d: { date: string }) => d.date === '2026-07-07',
        );
        const byStartHour = (hour: number) =>
          tuesday.slots.find(
            (s: { startAt: string }) =>
              new Date(s.startAt).getUTCHours() === hour,
          );

        expect(byStartHour(9).available).toBe(false);
        expect(byStartHour(10).available).toBe(false);
        expect(byStartHour(11).available).toBe(false);
        expect(byStartHour(12).available).toBe(true);
        expect(byStartHour(16).available).toBe(true);
      });
    });
  });

  // ─── Stock: POST /stock/batches ────────────────────────────────

  describe('POST /stock/batches', () => {
    let sid: string;

    beforeEach(async () => {
      sid = await performMockLogin();
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValue(undefined);
    });

    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer())
        .post('/stock/batches')
        .send({
          productVariantId: '00000000-0000-0000-0000-000000000001',
          quantity: 10,
          manufacturingDate: '2026-01-15',
        })
        .expect(401);
    });

    it('should return 400 when quantity is zero', async () => {
      const { variant } = await seedProduct();

      await request(app.getHttpServer())
        .post('/stock/batches')
        .set('Cookie', sid)
        .send({
          productVariantId: variant.id,
          quantity: 0,
          manufacturingDate: '2026-01-15',
        })
        .expect(400);
    });

    it('should return 400 when quantity is negative', async () => {
      const { variant } = await seedProduct();

      await request(app.getHttpServer())
        .post('/stock/batches')
        .set('Cookie', sid)
        .send({
          productVariantId: variant.id,
          quantity: -5,
          manufacturingDate: '2026-01-15',
        })
        .expect(400);
    });

    it('should return 404 when productVariantId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/stock/batches')
        .set('Cookie', sid)
        .send({
          productVariantId: '550e8400-e29b-41d4-a716-446655440099',
          quantity: 10,
          manufacturingDate: '2026-01-15',
        })
        .expect(404);
    });

    it('should create batch with computed expiration date', async () => {
      const { variant } = await seedProduct({
        shelfLifeValue: 30,
        shelfLifeUnit: ShelfLifeUnit.DAY,
      });

      const { body } = await request(app.getHttpServer())
        .post('/stock/batches')
        .set('Cookie', sid)
        .send({
          productVariantId: variant.id,
          quantity: 100,
          manufacturingDate: '2026-01-15',
          batchCode: 'LOT-E2E-001',
        })
        .expect(201);

      expect(body.id).toBeTruthy();
      expect(body.productVariantId).toBe(variant.id);
      expect(body.batchCode).toBe('LOT-E2E-001');
      expect(body.initialQuantity).toBe(100);
      expect(body.remainingQuantity).toBe(100);
      expect(String(body.manufacturingDate).slice(0, 10)).toBe('2026-01-15');
      expect(String(body.expirationDate).slice(0, 10)).toBe('2026-02-14');

      const movements = await dataSource.getRepository(StockMovement).find({
        where: { batchId: body.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe(StockMovementType.IMPORT);
      expect(movements[0].quantity).toBe(100);

      const instances = await dataSource.getRepository(ProductInstance).find({
        where: { stockBatchId: body.id },
      });
      expect(instances).toHaveLength(100);
      expect(
        instances.every((i) => i.status === ProductInstanceStatus.ON_RACK),
      ).toBe(true);
    });
  });

  // ─── Stock: POST /stock/batches/:id/adjust ───────────────────────

  describe('POST /stock/batches/:id/adjust', () => {
    let sid: string;

    beforeEach(async () => {
      sid = await performMockLogin();
      jest
        .spyOn(authService, 'refreshTokenIfNeeded')
        .mockResolvedValue(undefined);
    });

    it('should return 401 without session cookie', async () => {
      await request(app.getHttpServer())
        .post('/stock/batches/00000000-0000-0000-0000-000000000001/adjust')
        .send({ quantity: 50 })
        .expect(401);
    });

    it('should return 400 when quantity is zero', async () => {
      const { variant } = await seedProduct();
      const batch = await stockService.createBatch({
        productVariantId: variant.id,
        quantity: 100,
        manufacturingDate: '2026-01-15',
      });

      await request(app.getHttpServer())
        .post(`/stock/batches/${batch.id}/adjust`)
        .set('Cookie', sid)
        .send({ quantity: 0 })
        .expect(400);
    });

    it('should return 404 when batch id does not exist', async () => {
      await request(app.getHttpServer())
        .post('/stock/batches/00000000-0000-0000-0000-000000000099/adjust')
        .set('Cookie', sid)
        .send({ quantity: 50 })
        .expect(404);
    });

    it('should adjust remaining quantity and record ADJUSTMENT movement', async () => {
      const { variant } = await seedProduct();
      const batch = await stockService.createBatch({
        productVariantId: variant.id,
        quantity: 100,
        manufacturingDate: '2026-01-15',
      });

      const { body } = await request(app.getHttpServer())
        .post(`/stock/batches/${batch.id}/adjust`)
        .set('Cookie', sid)
        .send({ quantity: 75, note: 'E2E inventory correction' })
        .expect(200);

      expect(body.batch.id).toBe(batch.id);
      expect(body.batch.remainingQuantity).toBe(75);
      expect(body.movement.type).toBe(StockMovementType.ADJUSTMENT);
      expect(body.movement.quantity).toBe(75);
      expect(body.movement.note).toBe('E2E inventory correction');

      const updated = await dataSource
        .getRepository(StockBatch)
        .findOneBy({ id: batch.id });
      expect(updated?.remainingQuantity).toBe(75);
    });
  });

  // ─── Stock: deductByVariantId + ProductInstance ──────────────────

  describe('StockService.deductByVariantId (product instances)', () => {
    it('should mark deducted instances as SOLD', async () => {
      const { variant } = await seedProduct();
      const batch = await stockService.createBatch({
        productVariantId: variant.id,
        quantity: 10,
        manufacturingDate: '2026-01-15',
      });

      await stockService.deductByVariantId(variant.id, 3, 'E2E deduction');

      const instances = await dataSource.getRepository(ProductInstance).find({
        where: { stockBatchId: batch.id },
        order: { createdAt: 'ASC' },
      });

      expect(instances).toHaveLength(10);
      expect(
        instances.filter((i) => i.status === ProductInstanceStatus.SOLD),
      ).toHaveLength(3);
      expect(
        instances.filter((i) => i.status === ProductInstanceStatus.ON_RACK),
      ).toHaveLength(7);
    });

    it('should link instances to orderItemId when provided', async () => {
      const { variant } = await seedProduct();
      await stockService.createBatch({
        productVariantId: variant.id,
        quantity: 5,
        manufacturingDate: '2026-01-15',
      });

      const user = await seedUser({
        keycloakSub: 'kc-stock-deduct',
        email: 'stock-deduct@example.com',
      });
      const customer = await dataSource
        .getRepository(Customer)
        .save(dataSource.getRepository(Customer).create({ userId: user.id }));
      const order = await dataSource.getRepository(Order).save(
        dataSource.getRepository(Order).create({
          customerId: customer.id,
          status: OrderStatus.PENDING,
          totalVnd: 300000,
        }),
      );
      const orderItem = await dataSource.getRepository(OrderItem).save(
        dataSource.getRepository(OrderItem).create({
          orderId: order.id,
          productVariantId: variant.id,
          quantity: 2,
          unitPriceVnd: 150000,
          lineTotalVnd: 300000,
        }),
      );

      await stockService.deductByVariantId(
        variant.id,
        2,
        'E2E order deduction',
        orderItem.id,
      );

      const sold = await dataSource.getRepository(ProductInstance).find({
        where: {
          orderItemId: orderItem.id,
          status: ProductInstanceStatus.SOLD,
        },
      });
      expect(sold).toHaveLength(2);
    });
  });

  // ─── Knowledge schema: protocols, labels, mappings ─────────────

  describe('Knowledge schema entities', () => {
    it('should persist IngredientProtocol with timePerWeek, timeOfUse, and durationWeeks', async () => {
      const ingredient = await dataSource.getRepository(Ingredient).save(
        dataSource.getRepository(Ingredient).create({
          name: 'Retinol E2E',
          ingredientType: 'retinoid',
          isActiveIngredient: true,
        }),
      );

      const protocolRepo = dataSource.getRepository(IngredientProtocol);
      const saved = await protocolRepo.save(
        protocolRepo.create({
          ingredientId: ingredient.id,
          code: 'retinol_0.3_e2e',
          name: 'Retinol 0.3% Anti-Aging',
          concentrationPct: 0.3,
          timePerWeek: 0.5,
          timeOfUse: TimeOfUse.PM,
          durationWeeks: 12,
          instructions: 'Apply pea-sized amount at night',
          isActive: true,
        }),
      );

      const loaded = await protocolRepo.findOneByOrFail({ id: saved.id });

      expect(loaded.code).toBe('retinol_0.3_e2e');
      expect(Number(loaded.concentrationPct)).toBe(0.3);
      expect(Number(loaded.timePerWeek)).toBe(0.5);
      expect(loaded.timeOfUse).toBe(TimeOfUse.PM);
      expect(loaded.durationWeeks).toBe(12);
      expect(loaded.instructions).toBe('Apply pea-sized amount at night');
      expect(loaded.isActive).toBe(true);
      expect(loaded).not.toHaveProperty('conditions');
    });

    it('should default Label.isActive to true', async () => {
      const category = await dataSource.getRepository(LabelCategory).save(
        dataSource.getRepository(LabelCategory).create({
          code: 'CONSTRAINT_E2E',
          name: 'Constraint',
        }),
      );

      const labelRepo = dataSource.getRepository(Label);
      const saved = await labelRepo.save(
        labelRepo.create({
          categoryId: category.id,
          code: 'age_gte_18',
          name: 'Age >= 18',
        }),
      );

      const loaded = await labelRepo.findOneByOrFail({ id: saved.id });
      expect(loaded.isActive).toBe(true);
    });

    it('should persist ProtocolLabel matchType per protocol-label pair', async () => {
      const { ingredient, category } = await seedKnowledgeBase();

      const protocolRepo = dataSource.getRepository(IngredientProtocol);
      const labelRepo = dataSource.getRepository(Label);
      const protocolLabelRepo = dataSource.getRepository(ProtocolLabel);

      const protocol = await protocolRepo.save(
        protocolRepo.create({
          ingredientId: ingredient.id,
          code: 'retinol_0.3_match_e2e',
          name: 'Retinol 0.3%',
          timePerWeek: 2,
          timeOfUse: TimeOfUse.AM_PM,
          durationWeeks: 8,
          isActive: true,
        }),
      );

      const ageLabel = await labelRepo.save(
        labelRepo.create({
          categoryId: category.id,
          code: 'age_gte_18_match',
          name: 'Age >= 18',
          isActive: true,
        }),
      );
      const pregnancyLabel = await labelRepo.save(
        labelRepo.create({
          categoryId: category.id,
          code: 'pregnancy_match',
          name: 'Pregnancy',
          isActive: true,
        }),
      );
      const antiAgingLabel = await labelRepo.save(
        labelRepo.create({
          categoryId: category.id,
          code: 'anti_aging_match',
          name: 'Anti-aging',
          isActive: false,
        }),
      );

      await protocolLabelRepo.save([
        protocolLabelRepo.create({
          protocolId: protocol.id,
          labelId: ageLabel.id,
          matchType: LabelMatchType.REQUIRED,
        }),
        protocolLabelRepo.create({
          protocolId: protocol.id,
          labelId: pregnancyLabel.id,
          matchType: LabelMatchType.EXCLUDED,
        }),
        protocolLabelRepo.create({
          protocolId: protocol.id,
          labelId: antiAgingLabel.id,
          matchType: LabelMatchType.OPTIONAL,
        }),
      ]);

      const mappings = await protocolLabelRepo.find({
        where: { protocolId: protocol.id },
        relations: ['label'],
        order: { matchType: 'ASC' },
      });

      expect(mappings).toHaveLength(3);
      expect(mappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            matchType: LabelMatchType.EXCLUDED,
            label: expect.objectContaining({ code: 'pregnancy_match' }),
          }),
          expect.objectContaining({
            matchType: LabelMatchType.OPTIONAL,
            label: expect.objectContaining({
              code: 'anti_aging_match',
              isActive: false,
            }),
          }),
          expect.objectContaining({
            matchType: LabelMatchType.REQUIRED,
            label: expect.objectContaining({ code: 'age_gte_18_match' }),
          }),
        ]),
      );
    });

    it('should persist SkinType with four Baumann axis columns', async () => {
      const skinTypeRepo = dataSource.getRepository(SkinType);
      const saved = await skinTypeRepo.save(
        skinTypeRepo.create({
          code: 'OSPW_E2E',
          name: 'Oily, Sensitive, Pigmented, Wrinkled',
          description: 'Baumann type OSPW',
          oilyDry: OilyDry.OILY,
          sensitiveResistant: SensitiveResistant.SENSITIVE,
          pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
          wrinkledTight: WrinkledTight.WRINKLED,
        }),
      );

      const loaded = await skinTypeRepo.findOneByOrFail({ id: saved.id });

      expect(loaded.code).toBe('OSPW_E2E');
      expect(loaded.oilyDry).toBe(OilyDry.OILY);
      expect(loaded.sensitiveResistant).toBe(SensitiveResistant.SENSITIVE);
      expect(loaded.pigmentedNonPigmented).toBe(
        PigmentedNonPigmented.PIGMENTED,
      );
      expect(loaded.wrinkledTight).toBe(WrinkledTight.WRINKLED);
    });

    it('should persist CustomerSkinTypeDetails as 1:1 profile extension for Customer', async () => {
      const user = await seedUser({
        keycloakSub: 'kc-baumann-profile',
        email: 'baumann@example.com',
        name: 'Baumann Customer',
      });
      const customer = await dataSource.getRepository(Customer).save(
        dataSource.getRepository(Customer).create({
          userId: user.id,
          phone: '0900000001',
        }),
      );
      const skinType = await dataSource.getRepository(SkinType).save(
        dataSource.getRepository(SkinType).create({
          code: 'DRNT_E2E',
          name: 'Dry, Resistant, Non-pigmented, Tight',
          oilyDry: OilyDry.DRY,
          sensitiveResistant: SensitiveResistant.RESISTANT,
          pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
          wrinkledTight: WrinkledTight.TIGHT,
        }),
      );

      const detailsRepo = dataSource.getRepository(CustomerSkinTypeDetails);
      const assessedAt = new Date('2026-06-01T10:00:00.000Z');
      await detailsRepo.save(
        detailsRepo.create({
          customerId: customer.id,
          skinTypeId: skinType.id,
          oilyDryScore: 28,
          sensitiveResistantScore: 22,
          pigmentedNonPigmentedScore: 18,
          wrinkledTightScore: 15,
          assessedAt,
        }),
      );

      const loaded = await detailsRepo.findOneOrFail({
        where: { customerId: customer.id },
        relations: ['customer', 'skinType'],
      });

      expect(loaded.customer.id).toBe(customer.id);
      expect(loaded.skinType?.code).toBe('DRNT_E2E');
      expect(loaded.oilyDryScore).toBe(28);
      expect(loaded.sensitiveResistantScore).toBe(22);
      expect(loaded.pigmentedNonPigmentedScore).toBe(18);
      expect(loaded.wrinkledTightScore).toBe(15);
      expect(loaded.assessedAt?.toISOString()).toBe(assessedAt.toISOString());
    });

    it('should allow CustomerSkinTypeDetails without assigned SkinType (incomplete profile)', async () => {
      const user = await seedUser({
        keycloakSub: 'kc-incomplete-profile',
        email: 'incomplete@example.com',
      });
      const customer = await dataSource
        .getRepository(Customer)
        .save(dataSource.getRepository(Customer).create({ userId: user.id }));

      const detailsRepo = dataSource.getRepository(CustomerSkinTypeDetails);
      await detailsRepo.save(
        detailsRepo.create({
          customerId: customer.id,
          skinTypeId: null,
        }),
      );

      const loaded = await detailsRepo.findOneByOrFail({
        customerId: customer.id,
      });

      expect(loaded.skinTypeId).toBeNull();
    });

    it('should persist ProtocolSkinType recommendation per protocol-skin-type pair', async () => {
      const { ingredient } = await seedKnowledgeBase();
      const skinTypeRepo = dataSource.getRepository(SkinType);
      const protocolRepo = dataSource.getRepository(IngredientProtocol);
      const protocolSkinTypeRepo = dataSource.getRepository(ProtocolSkinType);

      const oilySensitive = await skinTypeRepo.save(
        skinTypeRepo.create({
          code: 'OSNT_E2E',
          name: 'Oily, Sensitive, Non-pigmented, Tight',
          oilyDry: OilyDry.OILY,
          sensitiveResistant: SensitiveResistant.SENSITIVE,
          pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
          wrinkledTight: WrinkledTight.TIGHT,
        }),
      );
      const dryResistant = await skinTypeRepo.save(
        skinTypeRepo.create({
          code: 'DRNT_E2E_PROTO',
          name: 'Dry, Resistant, Non-pigmented, Tight',
          oilyDry: OilyDry.DRY,
          sensitiveResistant: SensitiveResistant.RESISTANT,
          pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
          wrinkledTight: WrinkledTight.TIGHT,
        }),
      );

      const protocol = await protocolRepo.save(
        protocolRepo.create({
          ingredientId: ingredient.id,
          code: 'niacinamide_baumann_e2e',
          name: 'Niacinamide 5%',
          isActive: true,
        }),
      );

      await protocolSkinTypeRepo.save([
        protocolSkinTypeRepo.create({
          protocolId: protocol.id,
          skinTypeId: oilySensitive.id,
          recommendation: SkinTypeRecommendation.RECOMMENDED,
        }),
        protocolSkinTypeRepo.create({
          protocolId: protocol.id,
          skinTypeId: dryResistant.id,
          recommendation: SkinTypeRecommendation.AVOID,
        }),
      ]);

      const mappings = await protocolSkinTypeRepo.find({
        where: { protocolId: protocol.id },
        relations: ['skinType'],
        order: { recommendation: 'ASC' },
      });

      expect(mappings).toHaveLength(2);
      expect(mappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recommendation: SkinTypeRecommendation.AVOID,
            skinType: expect.objectContaining({ code: 'DRNT_E2E_PROTO' }),
          }),
          expect.objectContaining({
            recommendation: SkinTypeRecommendation.RECOMMENDED,
            skinType: expect.objectContaining({ code: 'OSNT_E2E' }),
          }),
        ]),
      );
    });

    it('should persist CustomerSurvey without skinTypeId (survey is per routine/treatment)', async () => {
      const user = await seedUser({
        keycloakSub: 'kc-survey-no-skintype',
        email: 'survey@example.com',
      });
      const customer = await dataSource
        .getRepository(Customer)
        .save(dataSource.getRepository(Customer).create({ userId: user.id }));

      const surveyRepo = dataSource.getRepository(CustomerSurvey);
      const saved = await surveyRepo.save(
        surveyRepo.create({
          customerId: customer.id,
          isCompleted: false,
        }),
      );

      const loaded = await surveyRepo.findOneByOrFail({ id: saved.id });

      expect(loaded.customerId).toBe(customer.id);
      expect(loaded.isCompleted).toBe(false);
      expect(loaded).not.toHaveProperty('skinTypeId');
    });
  });

  // ─── Helper: seed product for stock tests ────────────────────────

  async function seedKnowledgeBase(): Promise<{
    ingredient: Ingredient;
    category: LabelCategory;
  }> {
    const ingredient = await dataSource.getRepository(Ingredient).save(
      dataSource.getRepository(Ingredient).create({
        name: `Knowledge Base Ingredient ${Math.random().toString(36).slice(2, 8)}`,
        ingredientType: 'vitamin',
        isActiveIngredient: true,
      }),
    );

    const category = await dataSource.getRepository(LabelCategory).save(
      dataSource.getRepository(LabelCategory).create({
        code: `CAT_${Math.random().toString(36).slice(2, 8)}`,
        name: 'Knowledge Base Category',
      }),
    );

    return { ingredient, category };
  }

  async function seedProduct(
    overrides: {
      name?: string;
      brandName?: string;
      categoryCode?: string;
      categoryName?: string;
      priceVnd?: number;
      shelfLifeValue?: number;
      shelfLifeUnit?: ShelfLifeUnit;
      sku?: string;
    } = {},
  ): Promise<{ product: Product; variant: ProductVariant }> {
    const brandRepo = dataSource.getRepository(ProductBrand);
    const categoryRepo = dataSource.getRepository(ProductCategory);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);

    const brandName = overrides.brandName ?? 'E2E Brand';
    let brand = await brandRepo.findOneBy({ name: brandName });
    if (!brand) {
      brand = await brandRepo.save(
        brandRepo.create({ name: brandName, isActive: true }),
      );
    }

    const categoryCode = overrides.categoryCode ?? 'TREATMENT';
    let category = await categoryRepo.findOneBy({ code: categoryCode });
    if (!category) {
      category = await categoryRepo.save(
        categoryRepo.create({
          code: categoryCode,
          name: overrides.categoryName ?? categoryCode,
          isActive: true,
        }),
      );
    }

    const product = await productRepo.save(
      productRepo.create({
        name: overrides.name ?? 'E2E Product',
        brandId: brand.id,
        categoryId: category.id,
        isActive: true,
      }),
    );

    const variant = await variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: overrides.sku ?? `SKU-E2E-${product.id.slice(0, 8)}`,
        priceVnd: overrides.priceVnd ?? 100000,
        shelfLifeValue: overrides.shelfLifeValue ?? 30,
        shelfLifeUnit: overrides.shelfLifeUnit ?? ShelfLifeUnit.DAY,
        isActive: true,
      }),
    );

    return { product, variant };
  }

  type OnboardProductPayload = {
    name: string;
    brand: string;
    categoryCode: string;
    categoryName?: string;
    sku: string;
    priceVnd: number;
    shelfLifeValue?: number;
    shelfLifeUnit?: ShelfLifeUnit;
    ingredients: Array<{
      name: string;
      concentrationPct?: number;
      isKeyIngredient?: boolean;
    }>;
  };

  type OnboardProductResponse = {
    product: {
      id: string;
      name: string;
      brandId: string;
      brandName: string;
      categoryId: string;
      categoryName: string;
      variants: Array<{ id: string; sku: string; priceVnd: number }>;
    };
    ingredients: Array<{
      name: string;
      concentrationPct: number | null;
      isKeyIngredient: boolean;
    }>;
  };

  async function onboardProductViaHttp(
    sid: string,
    overrides: Partial<OnboardProductPayload> = {},
  ): Promise<OnboardProductResponse> {
    const payload: OnboardProductPayload = {
      name: 'La Roche-Posay Effaclar Serum',
      brand: 'La Roche-Posay',
      categoryCode: 'SERUM',
      categoryName: 'Serum',
      sku: `LRP-EFFAC-${Math.random().toString(36).slice(2, 8)}`,
      priceVnd: 650000,
      shelfLifeValue: 365,
      shelfLifeUnit: ShelfLifeUnit.DAY,
      ingredients: [
        {
          name: 'Salicylic Acid',
          concentrationPct: 1.5,
          isKeyIngredient: true,
        },
        { name: 'Niacinamide', concentrationPct: 2 },
      ],
      ...overrides,
    };

    const { body } = await request(app.getHttpServer())
      .post('/products')
      .set('Cookie', sid)
      .send(payload)
      .expect(201);

    return body as OnboardProductResponse;
  }

  async function seedClinic(name = 'E2E Clinic'): Promise<Clinic> {
    const repo = dataSource.getRepository(Clinic);
    return repo.save(
      repo.create({
        name,
        address: 'E2E Address',
      }),
    );
  }

  async function seedUser(overrides: Partial<User> = {}): Promise<User> {
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        keycloakSub: `kc-${Math.random().toString(36).slice(2)}`,
        email: 'seed@example.com',
        name: 'Seed User',
        provider: 'keycloak',
        roles: [Role.Customer],
        clinicId: null,
        isActive: true,
        ...overrides,
      }),
    );
  }

  // ─── Helper: simulate a complete login via mock ────────────────

  async function performMockLogin(options?: {
    userId?: string;
    keycloakSub?: string;
    roles?: Role[];
    clinicId?: string | null;
    email?: string;
    name?: string;
    provider?: string;
  }): Promise<string> {
    const userId = options?.userId ?? 'e2e-user-id';
    const keycloakSub = options?.keycloakSub ?? 'kc-sub-e2e';
    const email = options?.email ?? 'e2e@example.com';
    const name = options?.name ?? 'E2E User';
    const provider = options?.provider ?? 'keycloak';
    const roles = options?.roles ?? [Role.Customer];
    const clinicId = options?.clinicId ?? null;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ client_redirect_uri: 'http://localhost:5173/' })
      .expect(200);
    const sid = extractSid(loginRes);
    const loginUrl = new URL(loginRes.body.login_uri);
    const oauthState = loginUrl.searchParams.get('state')!;

    jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValueOnce({
      user: {
        id: userId,
        keycloakSub,
        email,
        name,
        provider,
        roles,
        clinicId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isNewUser: false,
      accessToken: 'mock-at',
      refreshToken: 'mock-rt',
      tokenExpiresAt: Date.now() + 300_000,
      idpHint: 'keycloak',
      roles,
    });

    const callbackRes = await request(app.getHttpServer())
      .get(`/auth/callback?code=mock-code&state=${oauthState}`)
      .set('Cookie', sid)
      .expect(302);

    return extractSid(callbackRes) || sid;
  }
});
