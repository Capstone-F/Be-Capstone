/**
 * Admin demo seeding: POST /admin/demo/customers must produce a customer whose
 * Today response already carries a LOW stock warning, plus check-ins and a
 * streak. Uses real TypeORM + Postgres; Keycloak is stubbed.
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.KEYCLOAK_PUBLIC_URL ??= 'http://localhost:8080';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { Order } from '../src/commerce/order.entity';
import { OrderStatus } from '../src/commerce/enums';
import { ConfigModule } from '../src/config/config.module';
import { DemoSeedService } from '../src/demo/demo-seed.service';
import { KeycloakAdminService } from '../src/keycloak/keycloak-admin.service';
import { ProductBrand } from '../src/products/product-brand.entity';
import { ProductCategory } from '../src/products/product-category.entity';
import { ProductVariant } from '../src/products/product-variant.entity';
import { Product } from '../src/products/product.entity';
import {
  DayHistoryStatus,
  RoutinePeriod,
  RoutineStatus,
  StockWarningLevel,
} from '../src/routines/enums';
import { RoutineCheckIn } from '../src/routines/routine-check-in.entity';
import { RoutineSideEffect } from '../src/routines/routine-side-effect.entity';
import { RoutineStepCompletion } from '../src/routines/routine-step-completion.entity';
import { RoutineStep } from '../src/routines/routine-step.entity';
import { RoutineTrackingService } from '../src/routines/routine-tracking.service';
import {
  getVnToday,
  LOW_STOCK_DAYS_LEFT,
  vnDateFromUtcDate,
} from '../src/routines/routine-tracking.rules';
import { Routine } from '../src/routines/routine.entity';
import { Customer } from '../src/users/customer.entity';
import { User } from '../src/users/user.entity';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';

const CATALOG = [
  { code: 'CLEANSER', name: 'Sữa rửa mặt demo', volume: '236ml', price: 3200 },
  { code: 'SERUM', name: 'Tinh chất demo', volume: '30ml', price: 1800 },
  {
    code: 'SUNSCREEN',
    name: 'Kem chống nắng demo',
    volume: '50ml',
    price: 5200,
  },
  // Non-ml packaging must be skipped: the estimator needs a bottle size.
  { code: 'MOISTURIZER', name: 'Kem dưỡng demo', volume: '454g', price: 4500 },
];

describe('Admin demo customer seeding (e2e)', () => {
  let moduleFixture: TestingModule;
  let dataSource: DataSource;
  let demoSeed: DemoSeedService;
  let tracking: RoutineTrackingService;

  const keycloakAdmin = {
    getAdminToken: jest.fn().mockResolvedValue('admin-token'),
    createUser: jest.fn(),
    getRealmRole: jest
      .fn()
      .mockResolvedValue({ id: 'role-id', name: 'customer' }),
    assignRealmRoles: jest.fn().mockResolvedValue(undefined),
    setUserEnabled: jest.fn().mockResolvedValue(undefined),
  };

  jest.setTimeout(60_000);

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
        TypeOrmModule.forFeature([
          User,
          Customer,
          Order,
          ProductVariant,
          Routine,
          RoutineStep,
          RoutineStepCompletion,
          RoutineCheckIn,
          RoutineSideEffect,
        ]),
      ],
      providers: [
        DemoSeedService,
        RoutineTrackingService,
        { provide: KeycloakAdminService, useValue: keycloakAdmin },
      ],
    }).compile();

    dataSource = moduleFixture.get(DataSource);
    demoSeed = moduleFixture.get(DemoSeedService);
    tracking = moduleFixture.get(RoutineTrackingService);

    await seedCatalog();
  });

  afterAll(async () => {
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  beforeEach(() => {
    keycloakAdmin.createUser.mockResolvedValue(randomUUID());
  });

  async function seedCatalog() {
    const brand = await dataSource
      .getRepository(ProductBrand)
      .save(
        dataSource.getRepository(ProductBrand).create({ name: 'DemoBrand' }),
      );

    for (const entry of CATALOG) {
      const category = await dataSource.getRepository(ProductCategory).save(
        dataSource.getRepository(ProductCategory).create({
          code: entry.code,
          name: entry.code,
        }),
      );
      const product = await dataSource.getRepository(Product).save(
        dataSource.getRepository(Product).create({
          name: entry.name,
          brandId: brand.id,
          categoryId: category.id,
          isActive: true,
        }),
      );
      await dataSource.getRepository(ProductVariant).save(
        dataSource.getRepository(ProductVariant).create({
          productId: product.id,
          sku: `DEMO-${entry.code}`,
          volume: entry.volume,
          priceVnd: entry.price,
          isActive: true,
        }),
      );
    }
  }

  it('seeds a customer whose Today already shows a LOW stock warning', async () => {
    const result = await demoSeed.seedDemoCustomer({ historyDays: 14 });

    expect(result.credentials.email).toMatch(/@glowscan\.local$/);
    expect(result.lowStock.warning).toBe(StockWarningLevel.LOW);
    expect(result.lowStock.sku).toBe('DEMO-SERUM');

    const today = await tracking.getToday(
      result.credentials.userId,
      RoutinePeriod.MORNING,
    );
    expect(today.routines).toHaveLength(1);

    const steps = today.routines[0].steps;
    const lowStep = steps.find(
      (step) => step.productVariant?.sku === 'DEMO-SERUM',
    );
    expect(lowStep?.warning).toBe(StockWarningLevel.LOW);
    expect(lowStep?.daysLeft).toBeGreaterThan(0);
    expect(lowStep?.daysLeft).toBeLessThanOrEqual(LOW_STOCK_DAYS_LEFT);
    expect(lowStep?.remainingMl).toBe(result.lowStock.remainingMl);
    expect(lowStep?.daysLeft).toBe(result.lowStock.daysLeft);

    for (const step of steps) {
      if (step.productVariant?.sku === 'DEMO-SERUM') continue;
      expect(step.warning).toBeNull();
    }

    // The 454g moisturizer has no ml volume, so it never became a step.
    expect(
      steps.some((s) => s.productVariant?.sku === 'DEMO-MOISTURIZER'),
    ).toBe(false);
  });

  it('leaves today untouched so a live check-in can still be demoed', async () => {
    const result = await demoSeed.seedDemoCustomer({});
    const vnToday = getVnToday();

    const today = await tracking.getToday(
      result.credentials.userId,
      RoutinePeriod.EVENING,
    );
    expect(today.routines[0].progress.completedCount).toBe(0);

    const checkIns = await tracking.listCheckIns(
      result.credentials.userId,
      result.routine.routineId,
      result.history.from,
      vnToday,
    );
    expect(checkIns).toHaveLength(result.history.checkInCount);
    expect(checkIns.every((c) => c.checkInDate < vnToday)).toBe(true);
    expect(checkIns[0].sideEffects).toHaveLength(1);

    await expect(
      tracking.createCheckIn(
        result.credentials.userId,
        result.routine.routineId,
        {},
      ),
    ).resolves.toMatchObject({ checkInDate: vnToday });
  });

  it('backdates the routine and fills the history calendar', async () => {
    const result = await demoSeed.seedDemoCustomer({ historyDays: 14 });

    const routine = await dataSource
      .getRepository(Routine)
      .findOneByOrFail({ id: result.routine.routineId });
    expect(routine.status).toBe(RoutineStatus.ACTIVE);
    expect(vnDateFromUtcDate(routine.createdAt)).toBe(
      result.routine.activeFromDate,
    );

    const order = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: result.routine.sourceOrderId });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.createdAt.getTime()).toBeLessThan(routine.createdAt.getTime());

    const history = await tracking.getHistory(
      result.credentials.userId,
      result.routine.routineId,
      result.history.from,
      result.history.to,
    );
    const byStatus = (status: DayHistoryStatus) =>
      history.days.filter((d) => d.status === status).length;

    expect(history.days).toHaveLength(14);
    expect(byStatus(DayHistoryStatus.COMPLETED)).toBe(
      result.history.completedDays,
    );
    expect(byStatus(DayHistoryStatus.MISSED)).toBe(result.history.missedDays);
    expect(history.summary.currentStreak).toBe(result.history.currentStreak);
  });

  it('rejects a duplicate email without creating a Keycloak account', async () => {
    const email = `dup-${randomUUID().slice(0, 8)}@glowscan.local`;
    await demoSeed.seedDemoCustomer({ email });

    keycloakAdmin.createUser.mockClear();
    await expect(demoSeed.seedDemoCustomer({ email })).rejects.toThrow(
      /đã được sử dụng/,
    );
    expect(keycloakAdmin.createUser).not.toHaveBeenCalled();
  });
});
