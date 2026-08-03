/**
 * Survey face-scan e2e (mock skin vision + stubbed R2 upload).
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.LLM_PROVIDER ??= 'mock';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import session = require('express-session');
import { DataSource } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { Role } from '../src/auth/roles.enum';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { SKIN_VISION_LABEL_ALLOWLIST } from '../src/skin-vision/skin-vision.types';
import { LabelCategory } from '../src/survey/label-category.entity';
import { Label } from '../src/survey/label.entity';
import { StorageService } from '../src/uploads/storage.service';
import { Customer } from '../src/users/customer.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { UsersModule } from '../src/users/users.module';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';
import { createInMemoryRedis } from './in-memory-redis';

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
  llmProvider: 'mock',
  llmConfig: {
    provider: 'mock',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'gpt-oss:120b-cloud',
    ollamaVisionModel: 'llava',
    ollamaTimeoutMs: 120000,
  },
  paymentProvider: 'mock',
  paymentConfig: {
    tmnCode: 'E2ETMN01',
    hashSecret: 'e2e-hash-secret',
    vnpayHost: 'https://sandbox.vnpayment.vn',
    returnUrl: 'http://localhost:3000/payments/vnpay/return',
    ipnUrl: 'http://localhost:3000/payments/vnpay/ipn',
    clientReturnUrl: 'http://localhost:3000/vnpay_return',
    mobileReturnUrl: 'glowscan://vnpay-return',
  },
  getMissingRequiredKeys: () => [],
};

function extractSid(res: request.Response): string {
  const raw = res.headers['set-cookie'] ?? [];
  const cookies: string[] = Array.isArray(raw) ? raw : [raw];
  const sidCookie = cookies.find((c: string) => c.startsWith('sid='));
  return sidCookie ?? '';
}

/** Minimal valid JPEG (1x1). */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64',
);

describe('Survey face-scan (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let dataSource: DataSource;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        KeycloakAdminModule,
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        UsersModule,
        AuthModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue(TEST_CONFIG)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createInMemoryRedis())
      .overrideProvider(StorageService)
      .useValue({
        isConfigured: () => true,
        uploadImage: jest.fn().mockResolvedValue({
          url: 'https://cdn.example.com/images/face-e2e.jpg',
          key: 'images/face-e2e.jpg',
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
    dataSource = moduleFixture.get(DataSource);

    const categoryRepo = dataSource.getRepository(LabelCategory);
    const labelRepo = dataSource.getRepository(Label);
    let category = await categoryRepo.findOne({
      where: { code: 'SKIN_CONCERN' },
    });
    if (!category) {
      category = await categoryRepo.save(
        categoryRepo.create({
          code: 'SKIN_CONCERN',
          name: 'Skin Concern',
          description: null,
          vietnameseNormalized: null,
        }),
      );
    }
    for (const code of SKIN_VISION_LABEL_ALLOWLIST) {
      const existing = await labelRepo.findOne({ where: { code } });
      if (!existing) {
        await labelRepo.save(
          labelRepo.create({
            categoryId: category.id,
            code,
            name: code.split('_').join(' '),
            description: null,
            vietnameseNormalized: null,
            isActive: true,
          }),
        );
      }
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function seedCustomerUser(): Promise<{ user: User; sid: string }> {
    const userRepo = dataSource.getRepository(User);
    const customerRepo = dataSource.getRepository(Customer);
    const user = await userRepo.save(
      userRepo.create({
        keycloakSub: `kc-face-scan-${Date.now()}`,
        email: `face-scan-${Date.now()}@example.com`,
        name: 'Face Scan Customer',
        roles: [Role.Customer],
        isActive: true,
      }),
    );
    await customerRepo.save(
      customerRepo.create({
        userId: user.id,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('1998-01-01'),
      }),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ client_redirect_uri: 'http://localhost:5173/' })
      .expect(200);
    const sid = extractSid(loginRes);
    const loginUrl = new URL(loginRes.body.login_uri);
    const oauthState = loginUrl.searchParams.get('state')!;

    jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValueOnce({
      user,
      isNewUser: false,
      accessToken: 'face-scan-at',
      refreshToken: 'face-scan-rt',
      tokenExpiresAt: Date.now() + 300_000,
      idpHint: undefined,
      roles: [Role.Customer],
    });

    const callbackRes = await request(app.getHttpServer())
      .get(`/auth/callback?code=face-scan-code&state=${oauthState}`)
      .set('Cookie', sid)
      .expect(302);

    return { user, sid: extractSid(callbackRes) || sid };
  }

  it('uploads a face image and returns labels with explanations', async () => {
    const { sid } = await seedCustomerUser();

    const start = await request(app.getHttpServer())
      .post('/surveys')
      .set('Cookie', sid)
      .expect(201);

    const surveyId = start.body.id as string;
    expect(start.body.faceLabels).toEqual([]);

    const scan = await request(app.getHttpServer())
      .post(`/surveys/${surveyId}/face-scan`)
      .set('Cookie', sid)
      .attach('file', TINY_JPEG, {
        filename: 'face.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(scan.body.faceImageUrl).toBe(
      'https://cdn.example.com/images/face-e2e.jpg',
    );
    expect(scan.body.faceScannedAt).toBeTruthy();
    expect(Array.isArray(scan.body.faceLabels)).toBe(true);
    expect(scan.body.faceLabels.length).toBeGreaterThanOrEqual(1);
    for (const label of scan.body.faceLabels) {
      expect(SKIN_VISION_LABEL_ALLOWLIST).toContain(label.code);
      expect(typeof label.explanation).toBe('string');
      expect(label.explanation.trim().length).toBeGreaterThan(0);
      expect(label.name).toBeTruthy();
    }
  });
});
