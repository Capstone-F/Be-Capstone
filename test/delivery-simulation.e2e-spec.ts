/**
 * Delivery status simulator (e2e).
 * Cron is disabled; statuses are driven via POST /admin/deliveries/:id/advance and force-status.
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.KEYCLOAK_PUBLIC_URL ??= 'http://localhost:8080';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.ORDER_CANCELLATION_CRON_ENABLED = 'false';
process.env.DELIVERY_SIMULATION_ENABLED = 'false';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import session = require('express-session');
import { DataSource } from 'typeorm';
import { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { Role } from '../src/auth/roles.enum';
import { CommerceModule } from '../src/commerce/commerce.module';
import {
  OrderCancellationActor,
  OrderCancellationStatus,
  OrderSource,
  OrderStatus,
} from '../src/commerce/enums';
import { OrderCancellation } from '../src/commerce/order-cancellation.entity';
import { OrderItem } from '../src/commerce/order-item.entity';
import { Order } from '../src/commerce/order.entity';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { CustomersModule } from '../src/customers/customers.module';
import { DeliveryModule } from '../src/delivery/delivery.module';
import { DeliveryProvider } from '../src/delivery/delivery-provider.entity';
import { Delivery } from '../src/delivery/delivery.entity';
import { DeliveryStatus, DeliveryType } from '../src/delivery/enums';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';
import { ProductBrand } from '../src/products/product-brand.entity';
import { ProductCategory } from '../src/products/product-category.entity';
import { ProductVariant } from '../src/products/product-variant.entity';
import { Product } from '../src/products/product.entity';
import { ProductsModule } from '../src/products/products.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { ShelfLifeUnit } from '../src/stock/enums';
import { StockModule } from '../src/stock/stock.module';
import { StockService } from '../src/stock/stock.service';
import { Customer } from '../src/users/customer.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { UsersModule } from '../src/users/users.module';
import { WalletModule } from '../src/wallet/wallet.module';
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
  paymentProvider: 'mock',
  paymentConfig: {
    tmnCode: 'E2ETMN01',
    hashSecret: 'e2e-hash-secret',
    vnpayHost: 'https://sandbox.vnpayment.vn',
    returnUrl: 'http://localhost:3000/payments/vnpay/return',
    ipnUrl: 'http://localhost:3000/payments/vnpay/ipn',
  },
  payosConfig: {
    clientId: '',
    apiKey: '',
    checksumKey: '',
    returnUrl: 'http://localhost:3000/payments/payos/return',
    cancelUrl: 'http://localhost:3000/payments/payos/return',
    webhookUrl: '',
  },
  clientReturnUrl: 'http://localhost:3000/vnpay_return',
  mobileReturnUrl: 'glowscan://vnpay-return',
  shippingConfig: {
    token: '',
    shopId: '',
    baseUrl: 'https://dev-online-gateway.ghn.vn',
    fromDistrictId: 0,
    fromWardCode: '',
    webhookSecret: 'e2e-ghn-secret',
  },
  orderCancellationConfig: {
    cronEnabled: false,
    tickCron: '*/15 * * * * *',
    stepDelaySec: 60,
    batchSize: 20,
  },
  deliverySimulationConfig: {
    cronEnabled: false,
    tickCron: '*/15 * * * * *',
    stepDelaySec: 60,
    batchSize: 20,
  },
  getMissingRequiredKeys: () => [],
};

function extractSid(res: request.Response): string {
  const raw = res.headers['set-cookie'] ?? [];
  const cookies: string[] = Array.isArray(raw) ? raw : [raw];
  const sidCookie = cookies.find((c: string) => c.startsWith('sid='));
  return sidCookie ?? '';
}

describe('Delivery status simulation (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let stockService: StockService;
  let dataSource: DataSource;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        KeycloakAdminModule,
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        UsersModule,
        CustomersModule,
        AuthModule,
        StockModule,
        ProductsModule,
        DeliveryModule,
        CommerceModule,
        WalletModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue(TEST_CONFIG)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createInMemoryRedis())
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
    stockService = moduleFixture.get(StockService);
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

  it('advances happy path to delivered and updates order status', async () => {
    const { staffSid } = await seedActors();
    const { delivery, order } = await seedShippableDelivery({
      status: OrderStatus.PROCESSING,
      deliveryStatus: DeliveryStatus.PROCESSING,
      providerStatus: null,
    });

    const { body: parked } = await request(app.getHttpServer())
      .post(`/admin/deliveries/${delivery.id}/advance`)
      .set('Cookie', staffSid)
      .send({ steps: 7 })
      .expect(200);

    expect(parked.delivery.status).toBe(DeliveryStatus.PROCESSING);
    expect(parked.delivery.providerStatus).toBe('picking');
    expect(
      parked.transitions.map(
        (t: { providerStatus: string }) => t.providerStatus,
      ),
    ).toEqual(['ready_to_pick', 'picking']);

    const { body: handed } = await request(app.getHttpServer())
      .post(`/admin/orders/${order.id}/handover`)
      .set('Cookie', staffSid)
      .send({})
      .expect(200);

    expect(handed.status).toBe(DeliveryStatus.SHIPPED);
    expect(handed.providerStatus).toBe('picked');
    expect(handed.handedOverAt).toBeTruthy();

    const { body: advanced } = await request(app.getHttpServer())
      .post(`/admin/deliveries/${delivery.id}/advance`)
      .set('Cookie', staffSid)
      .send({ steps: 7 })
      .expect(200);

    expect(advanced.delivery.status).toBe(DeliveryStatus.DELIVERED);
    expect(advanced.delivery.providerStatus).toBe('delivered');
    expect(
      advanced.transitions.map(
        (t: { providerStatus: string }) => t.providerStatus,
      ),
    ).toEqual(['transporting', 'sorting', 'delivering', 'delivered']);

    const orderAfter = await dataSource.getRepository(Order).findOneByOrFail({
      id: order.id,
    });
    expect(orderAfter.status).toBe(OrderStatus.DELIVERED);

    const { body: stuck } = await request(app.getHttpServer())
      .post(`/admin/deliveries/${delivery.id}/advance`)
      .set('Cookie', staffSid)
      .send({ steps: 3 })
      .expect(200);
    expect(stuck.transitions).toEqual([]);
  });

  it('force returned auto-creates SYSTEM cancellation on cancellation tick', async () => {
    const { customerUser, customer, staffSid } = await seedActors();
    const { delivery, order, item } = await seedShippableDelivery({
      customerId: customer.id,
      status: OrderStatus.SHIPPED,
      deliveryStatus: DeliveryStatus.IN_TRANSIT,
      providerStatus: 'delivering',
      withSoldStock: true,
      quantity: 2,
    });

    const { body: forced } = await request(app.getHttpServer())
      .post(`/admin/deliveries/${delivery.id}/force-status`)
      .set('Cookie', staffSid)
      .send({ providerStatus: 'returned', note: 'customer refused' })
      .expect(200);

    expect(forced.applied).toBe(true);
    expect(forced.delivery.status).toBe(DeliveryStatus.RETURNED);
    expect(forced.deliveryStatus).toBe(DeliveryStatus.RETURNED);

    const orderStillShipped = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(orderStillShipped.status).toBe(OrderStatus.SHIPPED);

    const { body: tick } = await request(app.getHttpServer())
      .post('/admin/order-cancellations/tick')
      .set('Cookie', staffSid)
      .send({ ignoreDelay: true })
      .expect(200);

    expect(tick.autoCancelled).toContain(order.id);

    const cancellation = await dataSource
      .getRepository(OrderCancellation)
      .findOne({
        where: { orderId: order.id },
        relations: ['items'],
      });
    expect(cancellation).toBeTruthy();
    expect(cancellation!.requestedByActor).toBe(OrderCancellationActor.SYSTEM);
    expect(cancellation!.requestedByUserId).toBeNull();
    expect(cancellation!.items[0].orderItemId).toBe(item.id);
    expect(cancellation!.items[0].expectedQuantity).toBe(2);

    // Drive the new cancellation to AWAITING_RETURN in the same demo style.
    const { body: advanced } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${cancellation!.id}/advance`)
      .set('Cookie', staffSid)
      .send({ steps: 10 })
      .expect(200);
    expect(advanced.cancellation.status).toBe(
      OrderCancellationStatus.AWAITING_RETURN,
    );

    // Wallet should have been credited (shipping withheld for SHIPPED).
    void customerUser;
  });

  it('rejects force-status when providerOrderCode is missing', async () => {
    const { staffSid } = await seedActors();
    const { delivery } = await seedShippableDelivery({
      status: OrderStatus.PAID,
      deliveryStatus: DeliveryStatus.PENDING,
      providerStatus: null,
      providerOrderCode: null,
    });

    await request(app.getHttpServer())
      .post(`/admin/deliveries/${delivery.id}/force-status`)
      .set('Cookie', staffSid)
      .send({ providerStatus: 'delivered' })
      .expect(400);
  });

  it('lists deliveries and filters missingProviderCode', async () => {
    const { staffSid } = await seedActors();
    await seedShippableDelivery({
      status: OrderStatus.PAID,
      deliveryStatus: DeliveryStatus.PENDING,
      providerStatus: null,
      providerOrderCode: null,
    });
    await seedShippableDelivery({
      status: OrderStatus.PROCESSING,
      deliveryStatus: DeliveryStatus.PROCESSING,
      providerStatus: 'ready_to_pick',
    });

    const { body } = await request(app.getHttpServer())
      .get('/admin/deliveries')
      .query({ missingProviderCode: true })
      .set('Cookie', staffSid)
      .expect(200);

    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(
      body.items.every(
        (d: { providerOrderCode: string | null }) =>
          d.providerOrderCode === null,
      ),
    ).toBe(true);
  });

  async function seedActors(): Promise<{
    customerUser: User;
    customer: Customer;
    staffSid: string;
  }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const customerUser = await seedUser({
      keycloakSub: `kc-cust-${suffix}`,
      email: `cust-${suffix}@example.com`,
      name: 'Ship Customer',
      roles: [Role.Customer],
    });
    const customer = await dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        userId: customerUser.id,
        gender: Gender.NOT_PREFER_TO_SAY,
      }),
    );
    const staffUser = await seedUser({
      keycloakSub: `kc-staff-${suffix}`,
      email: `staff-${suffix}@example.com`,
      name: 'Ship Staff',
      roles: [Role.Staff],
    });
    const staffSid = await loginAs(staffUser, [Role.Staff]);
    return { customerUser, customer, staffSid };
  }

  async function ensureGhnProvider(): Promise<DeliveryProvider> {
    const repo = dataSource.getRepository(DeliveryProvider);
    const existing = await repo.findOneBy({ code: 'GHN' });
    if (existing) {
      return existing;
    }
    return repo.save(
      repo.create({
        code: 'GHN',
        name: 'Giao Hàng Nhanh',
        isActive: true,
      }),
    );
  }

  async function seedProductVariant(): Promise<ProductVariant> {
    const brandRepo = dataSource.getRepository(ProductBrand);
    const categoryRepo = dataSource.getRepository(ProductCategory);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);

    const brand = await brandRepo.save(
      brandRepo.create({
        name: `Ship Brand ${Math.random().toString(36).slice(2, 6)}`,
        isActive: true,
      }),
    );
    const category = await categoryRepo.save(
      categoryRepo.create({
        code: `SHP-${Math.random().toString(36).slice(2, 6)}`,
        name: 'Ship Cat',
        isActive: true,
      }),
    );
    const product = await productRepo.save(
      productRepo.create({
        name: 'Ship Product',
        brandId: brand.id,
        categoryId: category.id,
        isActive: true,
      }),
    );
    return variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: `SKU-SHP-${product.id.slice(0, 8)}`,
        priceVnd: 100000,
        shelfLifeValue: 30,
        shelfLifeUnit: ShelfLifeUnit.DAY,
        isActive: true,
      }),
    );
  }

  async function seedShippableDelivery(options: {
    customerId?: string;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    providerStatus: string | null;
    providerOrderCode?: string | null;
    withSoldStock?: boolean;
    quantity?: number;
  }): Promise<{
    order: Order;
    item: OrderItem;
    delivery: Delivery;
  }> {
    const actors = options.customerId === undefined ? await seedActors() : null;
    const customerId = options.customerId ?? actors!.customer.id;
    const quantity = options.quantity ?? 1;
    const variant = await seedProductVariant();
    const provider = await ensureGhnProvider();

    const subtotalVnd = variant.priceVnd * quantity;
    const shippingFeeVnd = 30000;
    const order = await dataSource.getRepository(Order).save(
      dataSource.getRepository(Order).create({
        customerId,
        status: options.status,
        source: OrderSource.CATALOG,
        subtotalVnd,
        discountVnd: 0,
        shippingFeeVnd,
        totalVnd: subtotalVnd + shippingFeeVnd,
        cancelledAt: null,
      }),
    );
    const item = await dataSource.getRepository(OrderItem).save(
      dataSource.getRepository(OrderItem).create({
        orderId: order.id,
        productVariantId: variant.id,
        quantity,
        unitPriceVnd: variant.priceVnd,
        lineTotalVnd: subtotalVnd,
        routineStepDetailsId: null,
        surveyRecommendationItemId: null,
      }),
    );

    if (options.withSoldStock) {
      await stockService.createBatch({
        productVariantId: variant.id,
        quantity,
        manufacturingDate: '2026-01-15',
        batchCode: `LOT-${order.id.slice(0, 6)}`,
      });
      await stockService.deductByVariantId(
        variant.id,
        quantity,
        `Order ${order.id} e2e`,
        item.id,
      );
    }

    const providerOrderCode =
      options.providerOrderCode === undefined
        ? `SIM-${order.id.slice(0, 8)}`
        : options.providerOrderCode;

    const delivery = await dataSource.getRepository(Delivery).save(
      dataSource.getRepository(Delivery).create({
        orderId: order.id,
        type: DeliveryType.STANDARD,
        providerId: provider.id,
        shippingAddress: '1 Le Loi, Dist 1',
        recipientName: 'Test',
        recipientPhone: '0901234567',
        provinceId: 202,
        districtId: 1449,
        wardCode: '21211',
        streetAddress: '1 Le Loi',
        status: options.deliveryStatus,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
        providerOrderCode,
        providerStatus: options.providerStatus,
        shippingFeeVnd,
        expectedDeliveryTime: null,
        lastStatusAt: null,
      }),
    );

    return { order, item, delivery };
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

  async function loginAs(user: User, roles: Role[]): Promise<string> {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ client_redirect_uri: 'http://localhost:5173/' })
      .expect(200);
    const sid = extractSid(loginRes);
    const loginUrl = new URL(loginRes.body.login_uri);
    const oauthState = loginUrl.searchParams.get('state')!;

    jest.spyOn(authService, 'exchangeCodeAndUpsertUser').mockResolvedValueOnce({
      user: {
        id: user.id,
        keycloakSub: user.keycloakSub,
        email: user.email,
        name: user.name,
        provider: user.provider,
        roles,
        clinicId: user.clinicId,
        isActive: true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      } as User,
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

    jest
      .spyOn(authService, 'refreshTokenIfNeeded')
      .mockResolvedValue(undefined);

    return extractSid(callbackRes) || sid;
  }
});
