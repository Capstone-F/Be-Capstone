import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { OrderSource, OrderStatus } from '../commerce/enums';
import { OrderItem } from '../commerce/order-item.entity';
import { Order } from '../commerce/order.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { ProductVariant } from '../products/product-variant.entity';
import {
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  StepCompletionStatus,
} from '../routines/enums';
import { RoutineCheckIn } from '../routines/routine-check-in.entity';
import { RoutineSideEffect } from '../routines/routine-side-effect.entity';
import { RoutineStepCompletion } from '../routines/routine-step-completion.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { RoutineStep } from '../routines/routine-step.entity';
import { getVnToday, parseMlVolume } from '../routines/routine-tracking.rules';
import { Routine } from '../routines/routine.entity';
import { Customer } from '../users/customer.entity';
import { Gender } from '../users/gender.enum';
import { User } from '../users/user.entity';
import {
  clampHistoryDays,
  planDemoRoutine,
  type DemoCatalogVariant,
  type DemoRoutinePlan,
  type DemoStepPlan,
  type DemoStockOutlook,
} from './demo-customer.plan';
import { SeedDemoCustomerResponseDto } from './dto/demo-customer-response.dto';
import { SeedDemoCustomerDto } from './dto/seed-demo-customer.dto';

/** Same password as the seeded demo accounts in docs/live-demo-coverage.md. */
const DEFAULT_DEMO_PASSWORD = 'P@ssw0rd';
const DEMO_EMAIL_DOMAIN = 'glowscan.local';
const DEMO_ROUTINE_TITLE = 'Quy trình chăm sóc da hằng ngày (demo)';
const DEMO_ROUTINE_DESCRIPTION =
  'Lộ trình demo đã chạy được vài tuần: có lịch sử check-in, chuỗi ngày hoàn thành và một sản phẩm sắp hết.';
/** UTC hours the backdated order / routine are stamped at (11:00 / 12:00 VN). */
const ORDER_UTC_HOUR = 4;
const ROUTINE_UTC_HOUR = 5;

/** Stock outlook narrowed to the case we hand back to the caller. */
type LowStockOutlook = DemoStockOutlook & {
  warning: NonNullable<DemoStockOutlook['warning']>;
};

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Provision a ready-to-demo customer: login, a paid survey order, an ACTIVE
   * routine backdated by `historyDays`, completed step history, daily check-ins,
   * and one product that already shows a LOW stock warning on Today.
   */
  async seedDemoCustomer(
    dto: SeedDemoCustomerDto,
    now: Date = new Date(),
  ): Promise<SeedDemoCustomerResponseDto> {
    const email = (dto.email ?? this.generateEmail()).trim().toLowerCase();
    const password = dto.password ?? DEFAULT_DEMO_PASSWORD;
    const fullName = dto.fullName?.trim() || 'Demo Customer';
    const historyDays = clampHistoryDays(dto.historyDays);

    await this.assertEmailAvailable(email);

    const plan = planDemoRoutine({
      variants: await this.loadCatalogVariants(),
      today: getVnToday(now),
      historyDays,
    });
    const lowStock = this.requireLowStockOutlook(plan);

    const adminToken = await this.keycloakAdmin.getAdminToken();
    const keycloakSub = await this.createKeycloakCustomer(
      adminToken,
      email,
      password,
      fullName,
    );

    try {
      return await this.dataSource.transaction((manager) =>
        this.persistDemoData(manager, {
          email,
          password,
          fullName,
          keycloakSub,
          plan,
          lowStock,
        }),
      );
    } catch (err) {
      await this.disableOrphanKeycloakUser(adminToken, keycloakSub, email);
      throw err;
    }
  }

  private async persistDemoData(
    manager: EntityManager,
    input: {
      email: string;
      password: string;
      fullName: string;
      keycloakSub: string;
      plan: DemoRoutinePlan;
      lowStock: LowStockOutlook;
    },
  ): Promise<SeedDemoCustomerResponseDto> {
    const { plan, lowStock } = input;

    const user = await manager.save(
      manager.create(User, {
        keycloakSub: input.keycloakSub,
        email: input.email,
        name: input.fullName,
        provider: 'keycloak',
        roles: [Role.Customer],
        clinicId: null,
        isActive: true,
      }),
    );

    const customer = await manager.save(
      manager.create(Customer, {
        userId: user.id,
        gender: Gender.FEMALE,
        dateOfBirth: new Date(Date.UTC(1998, 0, 1)),
      }),
    );

    const order = await this.createSourceOrder(manager, customer.id, plan);
    const routine = await this.createRoutine(manager, {
      customerId: customer.id,
      sourceOrderId: order.id,
      activeFromDate: plan.activeFromDate,
    });

    const stepIdByPlan = await this.createSteps(
      manager,
      routine.id,
      plan.steps,
    );
    await this.createHistory(manager, routine.id, plan, stepIdByPlan);

    this.logger.log(
      `Demo customer seeded — email: ${input.email}, routine: ${routine.id}, low-stock: ${lowStock.sku}`,
    );

    return {
      credentials: {
        email: input.email,
        password: input.password,
        userId: user.id,
        customerId: customer.id,
        keycloakSub: input.keycloakSub,
      },
      routine: {
        routineId: routine.id,
        title: DEMO_ROUTINE_TITLE,
        activeFromDate: plan.activeFromDate,
        morningSteps: plan.steps.filter(
          (s) => s.period === RoutinePeriod.MORNING,
        ).length,
        eveningSteps: plan.steps.filter(
          (s) => s.period === RoutinePeriod.EVENING,
        ).length,
        sourceOrderId: order.id,
      },
      history: {
        completedDays: plan.completedDays,
        missedDays: plan.missedDays,
        currentStreak: plan.currentStreak,
        checkInCount: plan.days.filter((day) => day.checkIn).length,
        from: plan.days[0].date,
        to: plan.days[plan.days.length - 1].date,
      },
      lowStock: {
        productVariantId: lowStock.variantId,
        sku: lowStock.sku,
        productName: lowStock.productName,
        bottleMl: lowStock.bottleMl,
        dailyMl: lowStock.dailyMl,
        remainingMl: lowStock.remainingMl,
        daysLeft: lowStock.daysLeft,
        warning: lowStock.warning,
        stepIds: plan.steps
          .filter((step) => step.variant.id === plan.lowStockVariantId)
          .map((step) => stepIdByPlan.get(step) as string),
      },
      nextSteps: this.buildNextSteps(routine.id, plan),
    };
  }

  private async createSourceOrder(
    manager: EntityManager,
    customerId: string,
    plan: DemoRoutinePlan,
  ): Promise<Order> {
    const variants = [
      ...new Map(
        plan.steps.map((step) => [step.variant.id, step.variant]),
      ).values(),
    ];
    const subtotalVnd = variants.reduce((sum, v) => sum + v.priceVnd, 0);

    const order = await manager.save(
      manager.create(Order, {
        customerId,
        status: OrderStatus.PAID,
        source: OrderSource.SURVEY,
        subtotalVnd,
        discountVnd: 0,
        discountType: null,
        shippingFeeVnd: 0,
        totalVnd: subtotalVnd,
      }),
    );

    for (const variant of variants) {
      await manager.save(
        manager.create(OrderItem, {
          orderId: order.id,
          productVariantId: variant.id,
          quantity: 1,
          unitPriceVnd: variant.priceVnd,
          lineTotalVnd: variant.priceVnd,
        }),
      );
    }

    // Bought just before the routine was generated, so the whole story is backdated.
    await manager.update(Order, order.id, {
      createdAt: atVnDate(plan.activeFromDate, ORDER_UTC_HOUR),
    });

    return order;
  }

  private async createRoutine(
    manager: EntityManager,
    input: {
      customerId: string;
      sourceOrderId: string;
      activeFromDate: string;
    },
  ): Promise<Routine> {
    const routine = await manager.save(
      manager.create(Routine, {
        customerId: input.customerId,
        type: RoutineType.AI_RECOMMENDED,
        status: RoutineStatus.ACTIVE,
        title: DEMO_ROUTINE_TITLE,
        description: DEMO_ROUTINE_DESCRIPTION,
        sourceOrderId: input.sourceOrderId,
        customerSurveyId: null,
        surveyRecommendationId: null,
        treatmentPhaseId: null,
        createdByExpertId: null,
      }),
    );

    // createdAt drives the history calendar's first day, so it has to be backdated.
    await manager.update(Routine, routine.id, {
      createdAt: atVnDate(input.activeFromDate, ROUTINE_UTC_HOUR),
    });

    return routine;
  }

  private async createSteps(
    manager: EntityManager,
    routineId: string,
    steps: DemoStepPlan[],
  ): Promise<Map<DemoStepPlan, string>> {
    const stepIdByPlan = new Map<DemoStepPlan, string>();

    for (const plan of steps) {
      const step = await manager.save(
        manager.create(RoutineStep, {
          routineId,
          name: plan.name,
          period: plan.period,
          stepOrder: plan.stepOrder,
          instructions: plan.instructions,
          waitMinutes: plan.waitMinutes,
          dosageText: plan.dosageText,
        }),
      );

      await manager.save(
        manager.create(RoutineStepDetails, {
          routineStepId: step.id,
          productVariantId: plan.variant.id,
          amountMl: plan.amountMl,
          date: null,
          period: plan.period,
          progressNote: null,
        }),
      );

      stepIdByPlan.set(plan, step.id);
    }

    return stepIdByPlan;
  }

  private async createHistory(
    manager: EntityManager,
    routineId: string,
    plan: DemoRoutinePlan,
    stepIdByPlan: Map<DemoStepPlan, string>,
  ): Promise<void> {
    for (const day of plan.days) {
      if (!day.completed) {
        continue;
      }

      for (const step of plan.steps) {
        await manager.save(
          manager.create(RoutineStepCompletion, {
            routineId,
            routineStepId: stepIdByPlan.get(step) as string,
            sessionDate: day.date as unknown as Date,
            period: step.period,
            status: StepCompletionStatus.COMPLETED,
            skipReason: null,
            skipNote: null,
            completedAt: atVnDate(
              day.date,
              step.period === RoutinePeriod.MORNING ? 1 : 13,
            ),
          }),
        );
      }

      if (!day.checkIn) {
        continue;
      }

      const checkIn = await manager.save(
        manager.create(RoutineCheckIn, {
          routineId,
          checkInDate: day.date as unknown as Date,
          period: day.checkIn.period,
          overallMood: day.checkIn.overallMood,
          acneLevel: day.checkIn.acneLevel,
          oilLevel: day.checkIn.oilLevel,
          rednessLevel: day.checkIn.rednessLevel,
          moistureLevel: day.checkIn.moistureLevel,
          completionRate: day.checkIn.completionRate,
          note: day.checkIn.note,
        }),
      );

      for (const effect of day.checkIn.sideEffects) {
        await manager.save(
          manager.create(RoutineSideEffect, {
            routineCheckInId: checkIn.id,
            type: effect.type,
            severity: effect.severity,
            note: effect.note,
          }),
        );
      }
    }
  }

  /**
   * Fail before anything is created if the plan would not actually surface a
   * warning — a catalog change must never yield a silently useless demo.
   */
  private requireLowStockOutlook(plan: DemoRoutinePlan): LowStockOutlook {
    const lowStock = plan.stockOutlook.find(
      (item) => item.variantId === plan.lowStockVariantId,
    );
    if (!lowStock?.warning) {
      throw new BadRequestException(
        'Không dựng được cảnh báo sắp hết sản phẩm cho lộ trình demo — hãy kiểm tra dữ liệu danh mục sản phẩm',
      );
    }
    return lowStock as LowStockOutlook;
  }

  /** Active variants whose volume is expressed in ml — the estimator needs a bottle size. */
  private async loadCatalogVariants(): Promise<DemoCatalogVariant[]> {
    const variants = await this.variantRepository.find({
      where: { isActive: true, product: { isActive: true } },
      relations: ['product', 'product.category'],
    });

    const usable: DemoCatalogVariant[] = [];
    for (const variant of variants) {
      const bottleMl = parseMlVolume(variant.volume);
      if (bottleMl === null) {
        continue;
      }
      usable.push({
        id: variant.id,
        sku: variant.sku,
        productName: variant.product?.name ?? variant.sku,
        categoryCode: variant.product?.category?.code ?? null,
        bottleMl,
        priceVnd: variant.priceVnd,
      });
    }

    if (usable.length === 0) {
      throw new BadRequestException(
        'Danh mục sản phẩm chưa có biến thể nào tính theo ml — hãy chạy npm run seed trước',
      );
    }

    return usable;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException(`Email ${email} đã được sử dụng`);
    }
  }

  private async createKeycloakCustomer(
    adminToken: string,
    email: string,
    password: string,
    fullName: string,
  ): Promise<string> {
    const { firstName, lastName } = splitName(fullName);
    const keycloakSub = await this.keycloakAdmin.createUser(adminToken, {
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: password, temporary: false }],
    });

    const customerRole = await this.keycloakAdmin.getRealmRole(
      adminToken,
      Role.Customer,
    );
    await this.keycloakAdmin.assignRealmRoles(adminToken, keycloakSub, [
      customerRole,
    ]);

    return keycloakSub;
  }

  /** The DB rolled back but Keycloak has no transaction — park the account instead. */
  private async disableOrphanKeycloakUser(
    adminToken: string,
    keycloakSub: string,
    email: string,
  ): Promise<void> {
    try {
      await this.keycloakAdmin.setUserEnabled(adminToken, keycloakSub, false);
      this.logger.warn(
        `Demo seeding failed after Keycloak user creation — disabled ${email} (${keycloakSub})`,
      );
    } catch (err) {
      this.logger.error(
        `Demo seeding failed and the Keycloak user ${email} (${keycloakSub}) could not be disabled — remove it manually`,
        err,
      );
    }
  }

  private buildNextSteps(routineId: string, plan: DemoRoutinePlan): string[] {
    const from = plan.days[0].date;
    const to = plan.days[plan.days.length - 1].date;
    return [
      'POST /auth/mobile/login (or the web login) with the credentials above',
      'GET /routines/me/today — the low-stock product carries warning=LOW with remainingMl / daysLeft',
      `GET /routines/${routineId}/check-ins?from=${from}&to=${to} — ${plan.days.filter((d) => d.checkIn).length} seeded check-ins`,
      `GET /routines/${routineId}/history?from=${from}&to=${to} — calendar with currentStreak=${plan.currentStreak}`,
      'Today is left untouched: complete/skip steps, then POST /routines/{routineId}/check-ins to demo a fresh check-in',
      'Buy-again: add the low-stock variant to the cart and pay — the next Today call clears the warning',
    ];
  }

  private generateEmail(): string {
    return `demo.customer.${randomUUID().slice(0, 8)}@${DEMO_EMAIL_DOMAIN}`;
  }
}

/** UTC instant that falls on the given VN calendar date (UTC+7). */
function atVnDate(date: string, utcHour: number): Date {
  return new Date(`${date}T${String(utcHour).padStart(2, '0')}:00:00.000Z`);
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? name.trim(), lastName: '' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
