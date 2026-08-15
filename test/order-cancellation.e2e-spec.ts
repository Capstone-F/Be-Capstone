/**
 * Order cancellation → wallet refund → staff restock (e2e).
 * Cron is disabled; the pipeline is driven through POST /admin/order-cancellations/:id/advance.
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.KEYCLOAK_PUBLIC_URL ??= 'http://localhost:8080';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.ORDER_CANCELLATION_CRON_ENABLED = 'false';

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
  OrderCancellationStatus,
  OrderSource,
  OrderStatus,
  TransactionType,
} from '../src/commerce/enums';
import { OrderItem } from '../src/commerce/order-item.entity';
import { Order } from '../src/commerce/order.entity';
import { Transaction } from '../src/commerce/transaction.entity';
import { ConfigModule } from '../src/config/config.module';
import { AppConfigService } from '../src/config/config.service';
import { CustomersModule } from '../src/customers/customers.module';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';
import { ProductBrand } from '../src/products/product-brand.entity';
import { ProductCategory } from '../src/products/product-category.entity';
import { ProductVariant } from '../src/products/product-variant.entity';
import { Product } from '../src/products/product.entity';
import { ProductsModule } from '../src/products/products.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import {
  ProductInstanceStatus,
  ShelfLifeUnit,
  StockMovementType,
} from '../src/stock/enums';
import { ProductInstance } from '../src/stock/product-instance.entity';
import { StockBatch } from '../src/stock/stock-batch.entity';
import { StockModule } from '../src/stock/stock.module';
import { StockMovement } from '../src/stock/stock-movement.entity';
import { StockService } from '../src/stock/stock.service';
import { Customer } from '../src/users/customer.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { UsersModule } from '../src/users/users.module';
import { Wallet } from '../src/users/wallet.entity';
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
    webhookSecret: '',
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

describe('Order cancellation refund restock (e2e)', () => {
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

  it('unpaid PENDING cancel completes with no refund and no restock', async () => {
    const { customerUser, customer, staffSid, adminSid } = await seedActors();
    const customerSid = await loginAs(customerUser, [Role.Customer]);
    const { order } = await seedOrder({
      customerId: customer.id,
      status: OrderStatus.PENDING,
      quantity: 1,
    });

    const { body: created } = await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', customerSid)
      .send({ reason: 'Changed my mind' })
      .expect(200);

    expect(created.status).toBe(OrderCancellationStatus.REQUESTED);
    expect(created.refundAmountVnd).toBe('0');
    expect(created.requiresStockReturn).toBe(false);

    await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', staffSid)
      .send({ steps: 5 })
      .expect(403);

    const { body: advanced } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', adminSid)
      .send({ steps: 5 })
      .expect(200);

    expect(advanced.cancellation.status).toBe(
      OrderCancellationStatus.COMPLETED,
    );
    const persisted = await dataSource.getRepository(Order).findOneByOrFail({
      id: order.id,
    });
    expect(persisted.status).toBe(OrderStatus.CANCELLED);
    expect(persisted.cancelledAt).toBeTruthy();

    const refunds = await dataSource.getRepository(Transaction).count({
      where: { orderId: order.id, type: TransactionType.REFUND },
    });
    expect(refunds).toBe(0);
  });

  it('paid cancel refunds wallet, parks stock, restocks good/damaged, and is idempotent', async () => {
    const { customerUser, customer, staffSid, adminSid } = await seedActors();
    const customerSid = await loginAs(customerUser, [Role.Customer]);
    const { order, item, batch } = await seedPaidOrderWithStock({
      customerId: customer.id,
      quantity: 3,
    });

    const remainingAfterSale = (
      await dataSource.getRepository(StockBatch).findOneByOrFail({
        id: batch.id,
      })
    ).remainingQuantity;
    expect(remainingAfterSale).toBe(0);

    const { body: created } = await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', customerSid)
      .send({ reason: 'Wrong item' })
      .expect(200);

    expect(created.status).toBe(OrderCancellationStatus.REQUESTED);
    expect(created.refundAmountVnd).toBe(String(order.totalVnd));
    expect(created.requiresStockReturn).toBe(true);
    expect(created.items[0].expectedQuantity).toBe(3);

    const { body: toReturn } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', adminSid)
      .send({ steps: 10 })
      .expect(200);

    expect(toReturn.cancellation.status).toBe(
      OrderCancellationStatus.AWAITING_RETURN,
    );
    expect(
      toReturn.transitions.map(
        (t: { from: string; to: string }) => `${t.from}->${t.to}`,
      ),
    ).toEqual([
      'REQUESTED->REFUNDING',
      'REFUNDING->REFUNDED',
      'REFUNDED->AWAITING_RETURN',
    ]);

    const refundedOrder = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(refundedOrder.status).toBe(OrderStatus.REFUNDED);

    const wallet = await dataSource.getRepository(Wallet).findOneByOrFail({
      userId: customerUser.id,
    });
    expect(wallet.balanceVnd).toBe(String(order.totalVnd));

    const refundTx = await dataSource.getRepository(Transaction).find({
      where: { orderId: order.id, type: TransactionType.REFUND },
    });
    expect(refundTx).toHaveLength(1);
    expect(refundTx[0].amountVnd).toBe(String(order.totalVnd));

    const returnedCount = await dataSource
      .getRepository(ProductInstance)
      .count({
        where: {
          orderItemId: item.id,
          status: ProductInstanceStatus.RETURNED,
        },
      });
    expect(returnedCount).toBe(3);

    const stillUnchanged = (
      await dataSource.getRepository(StockBatch).findOneByOrFail({
        id: batch.id,
      })
    ).remainingQuantity;
    expect(stillUnchanged).toBe(0);

    const { body: stuck } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', adminSid)
      .send({ steps: 5 })
      .expect(200);
    expect(stuck.cancellation.status).toBe(
      OrderCancellationStatus.AWAITING_RETURN,
    );
    expect(stuck.transitions).toEqual([]);

    const { body: restocked } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/confirm-return`)
      .set('Cookie', staffSid)
      .send({
        items: [
          {
            orderItemId: item.id,
            goodQuantity: 2,
            damagedQuantity: 1,
          },
        ],
        note: '1 bottle cracked',
      })
      .expect(200);
    expect(restocked.status).toBe(OrderCancellationStatus.RESTOCKED);

    const batchAfter = await dataSource
      .getRepository(StockBatch)
      .findOneByOrFail({ id: batch.id });
    expect(batchAfter.remainingQuantity).toBe(2);

    const onRack = await dataSource.getRepository(ProductInstance).count({
      where: { stockBatchId: batch.id, status: ProductInstanceStatus.ON_RACK },
    });
    const damaged = await dataSource.getRepository(ProductInstance).count({
      where: {
        orderItemId: item.id,
        status: ProductInstanceStatus.DAMAGED,
      },
    });
    expect(onRack).toBe(2);
    expect(damaged).toBe(1);

    const returnMovements = await dataSource
      .getRepository(StockMovement)
      .count({
        where: { batchId: batch.id, type: StockMovementType.RETURN },
      });
    expect(returnMovements).toBe(1);

    const { body: completed } = await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', adminSid)
      .send({ steps: 1 })
      .expect(200);
    expect(completed.cancellation.status).toBe(
      OrderCancellationStatus.COMPLETED,
    );

    await request(app.getHttpServer())
      .post(`/admin/order-cancellations/${created.id}/advance`)
      .set('Cookie', adminSid)
      .send({ steps: 3 })
      .expect(200);

    const refundsAfter = await dataSource.getRepository(Transaction).count({
      where: { orderId: order.id, type: TransactionType.REFUND },
    });
    expect(refundsAfter).toBe(1);
  });

  it('rejects cancelling a DELIVERED order', async () => {
    const { customer, staffSid } = await seedActors();
    const { order } = await seedOrder({
      customerId: customer.id,
      status: OrderStatus.DELIVERED,
      quantity: 1,
    });

    await request(app.getHttpServer())
      .post('/admin/order-cancellations')
      .set('Cookie', staffSid)
      .send({ orderId: order.id })
      .expect(400);
  });

  it('allows customer cancel while PROCESSING and refunds without the shipping fee', async () => {
    const { customerUser, customer } = await seedActors();
    const customerSid = await loginAs(customerUser, [Role.Customer]);
    const { order } = await seedOrder({
      customerId: customer.id,
      status: OrderStatus.PROCESSING,
      quantity: 1,
    });

    const { body: created } = await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', customerSid)
      .send({ reason: 'Changed my mind' })
      .expect(200);

    expect(created.status).toBe(OrderCancellationStatus.REQUESTED);
    // GHN flips PAID -> PROCESSING at order creation, before pickup, so the
    // customer keeps their cancel window — but the shipping fee is not refunded.
    expect(created.refundAmountVnd).toBe(
      String(order.subtotalVnd - order.discountVnd),
    );
    expect(created.refundAmountVnd).toBe(
      String(order.totalVnd - order.shippingFeeVnd),
    );
  });

  it('rejects customer cancel once the order is SHIPPED', async () => {
    const { customerUser, customer } = await seedActors();
    const customerSid = await loginAs(customerUser, [Role.Customer]);
    const { order } = await seedOrder({
      customerId: customer.id,
      status: OrderStatus.SHIPPED,
      quantity: 1,
    });

    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', customerSid)
      .send({})
      .expect(400);
  });

  async function seedActors(): Promise<{
    customerUser: User;
    customer: Customer;
    staffUser: User;
    staffSid: string;
    adminSid: string;
  }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const customerUser = await seedUser({
      keycloakSub: `kc-cust-${suffix}`,
      email: `cust-${suffix}@example.com`,
      name: 'Cancel Customer',
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
      name: 'Cancel Staff',
      roles: [Role.Staff],
    });
    const staffSid = await loginAs(staffUser, [Role.Staff]);
    const adminUser = await seedUser({
      keycloakSub: `kc-admin-${suffix}`,
      email: `admin-${suffix}@example.com`,
      name: 'Cancellation Admin',
      roles: [Role.AppAdmin],
    });
    const adminSid = await loginAs(adminUser, [Role.AppAdmin]);
    return { customerUser, customer, staffUser, staffSid, adminSid };
  }

  async function seedProductVariant(): Promise<ProductVariant> {
    const brandRepo = dataSource.getRepository(ProductBrand);
    const categoryRepo = dataSource.getRepository(ProductCategory);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);

    const brand = await brandRepo.save(
      brandRepo.create({
        name: `Cancel Brand ${Math.random().toString(36).slice(2, 6)}`,
        isActive: true,
      }),
    );
    const category = await categoryRepo.save(
      categoryRepo.create({
        code: `CXL-${Math.random().toString(36).slice(2, 6)}`,
        name: 'Cancel Cat',
        isActive: true,
      }),
    );
    const product = await productRepo.save(
      productRepo.create({
        name: 'Cancel Product',
        brandId: brand.id,
        categoryId: category.id,
        isActive: true,
      }),
    );
    return variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: `SKU-CXL-${product.id.slice(0, 8)}`,
        priceVnd: 100000,
        shelfLifeValue: 30,
        shelfLifeUnit: ShelfLifeUnit.DAY,
        isActive: true,
      }),
    );
  }

  async function seedOrder(options: {
    customerId: string;
    status: OrderStatus;
    quantity: number;
    variant?: ProductVariant;
  }): Promise<{ order: Order; item: OrderItem; variant: ProductVariant }> {
    const variant = options.variant ?? (await seedProductVariant());
    const subtotalVnd = variant.priceVnd * options.quantity;
    const shippingFeeVnd = 30000;
    const order = await dataSource.getRepository(Order).save(
      dataSource.getRepository(Order).create({
        customerId: options.customerId,
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
        quantity: options.quantity,
        unitPriceVnd: variant.priceVnd,
        lineTotalVnd: subtotalVnd,
        routineStepDetailsId: null,
        surveyRecommendationItemId: null,
      }),
    );
    return { order, item, variant };
  }

  async function seedPaidOrderWithStock(options: {
    customerId: string;
    quantity: number;
  }): Promise<{
    order: Order;
    item: OrderItem;
    variant: ProductVariant;
    batch: StockBatch;
  }> {
    const { order, item, variant } = await seedOrder({
      ...options,
      status: OrderStatus.PAID,
    });
    const batch = await stockService.createBatch({
      productVariantId: variant.id,
      quantity: options.quantity,
      manufacturingDate: '2026-01-15',
      batchCode: `LOT-${order.id.slice(0, 6)}`,
    });
    await stockService.deductByVariantId(
      variant.id,
      options.quantity,
      `Order ${order.id} e2e`,
      item.id,
    );
    return { order, item, variant, batch };
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
