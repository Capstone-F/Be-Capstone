import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Order } from '../commerce/order.entity';
import { OrderStatus } from '../commerce/enums';
import { Customer } from '../users/customer.entity';
import {
  CheckInResponseDto,
  HistoryDayDetailResponseDto,
  RoutineHistoryResponseDto,
  TodayRoutineDto,
  TodayRoutinesResponseDto,
  TodayStepDto,
} from './dto/routine-tracking-response.dto';
import { CreateCheckInDto, SkipStepDto } from './dto/routine-tracking.dto';
import { RoutineStepProductVariantDto } from './dto/routine-response.dto';
import { TreatmentPhaseStatus } from '../treatments/enums';
import {
  DayHistoryStatus,
  EmptyRoutineReason,
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  SessionState,
  StepCompletionStatus,
  StepSessionStatus,
  SkipReason,
} from './enums';
import { RoutineCheckIn } from './routine-check-in.entity';
import { compareRoutineSteps } from './routine-generator.service';
import { RoutineSideEffect } from './routine-side-effect.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';
import { RoutineStep } from './routine-step.entity';
import {
  aggregateSessionState,
  averageCompletionRate,
  computeCurrentStreak,
  computeProgress,
  defaultPeriodForNow,
  deriveDayHistoryStatus,
  deriveSessionState,
  eachDateInclusive,
  estimateVariantStock,
  getVnToday,
  parseMlVolume,
  progressFromStatuses,
  toDateString,
  vnDateFromUtcDate,
  type StepStockEstimate,
} from './routine-tracking.rules';
import { Routine } from './routine.entity';

const ROUTINE_STEP_RELATIONS = [
  'steps',
  'steps.stepProtocols',
  'steps.details',
  'steps.details.productVariant',
  'steps.details.productVariant.product',
  'treatmentPhase',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PAID_ORDER_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
] as const;

type StockContext = {
  purchasedQtyByVariant: Map<string, number>;
  usedMlByVariant: Map<string, number>;
  canTrackByVariant: Map<string, boolean>;
  /** Precomputed so AM/PM steps with the same variant share one warning. */
  estimateByVariant: Map<string, StepStockEstimate>;
};

@Injectable()
export class RoutineTrackingService {
  constructor(
    @InjectRepository(Routine)
    private readonly routineRepository: Repository<Routine>,
    @InjectRepository(RoutineStep)
    private readonly stepRepository: Repository<RoutineStep>,
    @InjectRepository(RoutineStepCompletion)
    private readonly completionRepository: Repository<RoutineStepCompletion>,
    @InjectRepository(RoutineCheckIn)
    private readonly checkInRepository: Repository<RoutineCheckIn>,
    @InjectRepository(RoutineSideEffect)
    private readonly sideEffectRepository: Repository<RoutineSideEffect>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async cancelAiRoutine(userId: string, routineId: string): Promise<void> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.requireOwnedRoutine(customer.id, routineId);
    if (routine.type !== RoutineType.AI_RECOMMENDED) {
      throw new BadRequestException(
        'Chỉ lộ trình chăm sóc AI_RECOMMENDED mới có thể hủy',
      );
    }
    if (routine.status !== RoutineStatus.ACTIVE) {
      throw new BadRequestException(
        'Lộ trình chăm sóc không ở trạng thái ACTIVE',
      );
    }
    routine.status = RoutineStatus.COMPLETED;
    await this.routineRepository.save(routine);
  }

  async getToday(
    userId: string,
    period?: RoutinePeriod,
    now: Date = new Date(),
  ): Promise<TodayRoutinesResponseDto> {
    const customer = await this.requireCustomer(userId);
    const resolvedPeriod = period ?? defaultPeriodForNow(now);
    const today = getVnToday(now);

    await this.completeExpiredPhaseRoutines(customer.id, now);

    const rawRoutines = await this.routineRepository.find({
      where: { customerId: customer.id, status: RoutineStatus.ACTIVE },
      relations: [...ROUTINE_STEP_RELATIONS],
      order: { createdAt: 'DESC' },
    });

    // Exclude expert-prescribed routines whose treatment phase is not yet ACTIVE (e.g. still PENDING)
    const routines = rawRoutines.filter((r) => {
      if (r.treatmentPhaseId && r.treatmentPhase) {
        return r.treatmentPhase.status === TreatmentPhaseStatus.ACTIVE;
      }
      return true;
    });

    if (routines.length === 0) {
      return {
        date: today,
        period: resolvedPeriod,
        sessionState: SessionState.EMPTY,
        reason: EmptyRoutineReason.NO_ACTIVE_ROUTINE,
        routines: [],
      };
    }

    const routineIds = routines.map((r) => r.id);
    const earliestCreated = routines.reduce(
      (min, r) => (r.createdAt < min ? r.createdAt : min),
      routines[0].createdAt,
    );

    const [sessionCompletions, usageCompletions, orders] = await Promise.all([
      this.completionRepository.find({
        where: {
          routineId: In(routineIds),
          sessionDate: today as unknown as Date,
          period: resolvedPeriod,
        },
      }),
      this.completionRepository.find({
        where: {
          routineId: In(routineIds),
          status: StepCompletionStatus.COMPLETED,
        },
      }),
      this.orderRepository.find({
        where: {
          customerId: customer.id,
          status: In([...PAID_ORDER_STATUSES]),
          createdAt: MoreThanOrEqual(earliestCreated),
        },
        relations: ['items'],
      }),
    ]);

    const completionByStep = new Map(
      sessionCompletions.map((c) => [c.routineStepId, c]),
    );
    const completedCountByStep = this.countCompletedByStep(usageCompletions);

    const todayRoutines: TodayRoutineDto[] = [];
    for (const routine of routines) {
      const periodSteps = [...(routine.steps ?? [])]
        .filter((s) => s.period === resolvedPeriod)
        .sort(compareRoutineSteps);

      todayRoutines.push(
        this.buildTodayRoutineDto(
          routine,
          periodSteps,
          completionByStep,
          today,
          today,
          this.buildStockContext(routine, orders, completedCountByStep),
        ),
      );
    }

    return {
      date: today,
      period: resolvedPeriod,
      sessionState: aggregateSessionState(
        todayRoutines.map((r) => r.sessionState),
      ),
      routines: todayRoutines,
    };
  }

  async completeStep(
    userId: string,
    routineId: string,
    stepId: string,
    now: Date = new Date(),
  ): Promise<TodayRoutineDto> {
    return this.actOnStep(
      userId,
      routineId,
      stepId,
      {
        status: StepCompletionStatus.COMPLETED,
        skipReason: null,
        skipNote: null,
      },
      now,
    );
  }

  async skipStep(
    userId: string,
    routineId: string,
    stepId: string,
    dto: SkipStepDto,
    now: Date = new Date(),
  ): Promise<TodayRoutineDto> {
    if (dto.reason === SkipReason.OTHER && !dto.note?.trim()) {
      throw new BadRequestException('note là bắt buộc khi reason là OTHER');
    }
    return this.actOnStep(
      userId,
      routineId,
      stepId,
      {
        status: StepCompletionStatus.SKIPPED,
        skipReason: dto.reason,
        skipNote: dto.note?.trim() || null,
      },
      now,
    );
  }

  async createCheckIn(
    userId: string,
    routineId: string,
    dto: CreateCheckInDto,
    now: Date = new Date(),
  ): Promise<CheckInResponseDto> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.requireOwnedActiveRoutine(
      customer.id,
      routineId,
      [],
      now,
    );
    const today = getVnToday(now);
    const date = dto.date ?? today;
    this.assertDateString(date);
    if (date !== today) {
      throw new BadRequestException(
        'Ngày check-in phải là hôm nay (Asia/Ho_Chi_Minh) cho MVP',
      );
    }

    const period = dto.period ?? defaultPeriodForNow(now);
    const existing = await this.checkInRepository.findOne({
      where: {
        routineId: routine.id,
        checkInDate: date as unknown as Date,
        period,
      },
    });

    const periodSteps = await this.stepRepository.find({
      where: { routineId: routine.id, period },
    });
    const completions = await this.completionRepository.find({
      where: {
        routineId: routine.id,
        sessionDate: date as unknown as Date,
        period,
      },
    });
    const progress = progressFromStatuses(
      periodSteps.map(
        (s) => completions.find((c) => c.routineStepId === s.id)?.status,
      ),
    );

    let checkIn: typeof existing;

    if (existing) {
      // Ghi đè / Cập nhật check-in (ví dụ người dùng báo cáo kích ứng hoặc cập nhật cảm nhận sau khi check-in)
      if (dto.overallMood !== undefined) existing.overallMood = dto.overallMood;
      if (dto.acneLevel !== undefined) existing.acneLevel = dto.acneLevel;
      if (dto.oilLevel !== undefined) existing.oilLevel = dto.oilLevel;
      if (dto.rednessLevel !== undefined)
        existing.rednessLevel = dto.rednessLevel;
      if (dto.moistureLevel !== undefined)
        existing.moistureLevel = dto.moistureLevel;
      existing.completionRate = progress.completionRate;
      if (dto.note !== undefined) {
        existing.note = existing.note
          ? `${existing.note}\n${dto.note}`
          : dto.note;
      }
      checkIn = await this.checkInRepository.save(existing);
    } else {
      checkIn = await this.checkInRepository.save(
        this.checkInRepository.create({
          routineId: routine.id,
          checkInDate: date as unknown as Date,
          period,
          overallMood: dto.overallMood ?? null,
          acneLevel: dto.acneLevel ?? null,
          oilLevel: dto.oilLevel ?? null,
          rednessLevel: dto.rednessLevel ?? null,
          moistureLevel: dto.moistureLevel ?? null,
          completionRate: progress.completionRate,
          note: dto.note ?? null,
        }),
      );
    }

    const sideEffects = dto.sideEffects ?? [];
    if (sideEffects.length > 0) {
      if (existing) {
        await this.sideEffectRepository.delete({
          routineCheckInId: checkIn.id,
        });
      }
      await this.sideEffectRepository.save(
        sideEffects.map((se) =>
          this.sideEffectRepository.create({
            routineCheckInId: checkIn.id,
            type: se.type,
            severity: se.severity ?? null,
            note: se.note ?? null,
          }),
        ),
      );
    }

    return this.toCheckInDto(
      await this.checkInRepository.findOneOrFail({
        where: { id: checkIn.id },
        relations: ['sideEffects'],
      }),
    );
  }

  async listCheckIns(
    userId: string,
    routineId: string,
    from: string,
    to: string,
  ): Promise<CheckInResponseDto[]> {
    const customer = await this.requireCustomer(userId);
    await this.requireOwnedRoutine(customer.id, routineId);
    this.assertDateString(from);
    this.assertDateString(to);
    if (from > to) {
      throw new BadRequestException('from phải <= to');
    }

    const rows = await this.checkInRepository.find({
      where: {
        routineId,
        checkInDate: Between(from as unknown as Date, to as unknown as Date),
      },
      relations: ['sideEffects'],
      order: { checkInDate: 'ASC', period: 'ASC' },
    });
    return rows.map((r) => this.toCheckInDto(r));
  }

  async getHistory(
    userId: string,
    routineId: string,
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<RoutineHistoryResponseDto> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.requireOwnedRoutine(customer.id, routineId);
    this.assertDateString(from);
    this.assertDateString(to);
    if (from > to) {
      throw new BadRequestException('from phải <= to');
    }

    const today = getVnToday(now);
    const activeFrom = vnDateFromUtcDate(routine.createdAt);
    const steps = await this.stepRepository.find({
      where: { routineId: routine.id },
    });
    const morningTotal = steps.filter(
      (s) => s.period === RoutinePeriod.MORNING,
    ).length;
    const eveningTotal = steps.filter(
      (s) => s.period === RoutinePeriod.EVENING,
    ).length;

    const completions = await this.completionRepository.find({
      where: {
        routineId: routine.id,
        sessionDate: Between(from as unknown as Date, to as unknown as Date),
      },
    });

    const days: Array<{
      date: string;
      status: DayHistoryStatus;
      completionRate: number;
    }> = [];
    const ratesForAvg: number[] = [];

    for (const date of eachDateInclusive(from, to)) {
      const dayCompletions = completions.filter(
        (c) => toDateString(c.sessionDate) === date,
      );
      const morningActed = dayCompletions.filter(
        (c) => c.period === RoutinePeriod.MORNING,
      ).length;
      const eveningActed = dayCompletions.filter(
        (c) => c.period === RoutinePeriod.EVENING,
      ).length;

      const status = deriveDayHistoryStatus({
        date,
        today,
        routineActiveFrom: activeFrom,
        periodTotals: [morningTotal, eveningTotal],
        periodActed: [morningActed, eveningActed],
      });
      if (status === null) {
        continue;
      }

      const total = morningTotal + eveningTotal;
      const completedCount = dayCompletions.filter(
        (c) => c.status === StepCompletionStatus.COMPLETED,
      ).length;
      const progress = computeProgress(total, completedCount, 0);
      days.push({
        date,
        status,
        completionRate: progress.completionRate,
      });
      if (status !== DayHistoryStatus.NOT_STARTED) {
        ratesForAvg.push(progress.completionRate);
      }
    }

    return {
      routineId: routine.id,
      days,
      summary: {
        currentStreak: computeCurrentStreak(days, today),
        averageCompletionRate: averageCompletionRate(ratesForAvg),
      },
    };
  }

  async getHistoryDay(
    userId: string,
    routineId: string,
    date: string,
    period?: RoutinePeriod,
    now: Date = new Date(),
  ): Promise<HistoryDayDetailResponseDto> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.requireOwnedRoutine(customer.id, routineId, [
      ...ROUTINE_STEP_RELATIONS,
    ]);
    this.assertDateString(date);
    const today = getVnToday(now);
    const resolvedPeriod = period ?? defaultPeriodForNow(now);
    const activeFrom = vnDateFromUtcDate(routine.createdAt);

    const periodSteps = [...(routine.steps ?? [])]
      .filter((s) => s.period === resolvedPeriod)
      .sort(compareRoutineSteps);

    const [sessionCompletions, usageCompletions, orders] = await Promise.all([
      this.completionRepository.find({
        where: {
          routineId: routine.id,
          sessionDate: date as unknown as Date,
          period: resolvedPeriod,
        },
      }),
      this.completionRepository.find({
        where: {
          routineId: routine.id,
          status: StepCompletionStatus.COMPLETED,
        },
      }),
      this.orderRepository.find({
        where: {
          customerId: customer.id,
          status: In([...PAID_ORDER_STATUSES]),
          createdAt: MoreThanOrEqual(routine.createdAt),
        },
        relations: ['items'],
      }),
    ]);

    const completionByStep = new Map(
      sessionCompletions.map((c) => [c.routineStepId, c]),
    );
    const stock = this.buildStockContext(
      routine,
      orders,
      this.countCompletedByStep(usageCompletions),
    );

    const stepsDto = periodSteps.map((step) =>
      this.toTodayStepDto(step, completionByStep.get(step.id) ?? null, stock),
    );
    const progress = progressFromStatuses(stepsDto.map((s) => s.status));
    const actedCount = progress.completedCount + progress.skippedCount;

    const dayStatus =
      deriveDayHistoryStatus({
        date,
        today,
        routineActiveFrom: activeFrom,
        periodTotals: [periodSteps.length],
        periodActed: [actedCount],
      }) ?? DayHistoryStatus.NOT_STARTED;

    const checkIn = await this.checkInRepository.findOne({
      where: {
        routineId: routine.id,
        checkInDate: date as unknown as Date,
        period: resolvedPeriod,
      },
      relations: ['sideEffects'],
    });

    return {
      date,
      period: resolvedPeriod,
      status: dayStatus,
      progress,
      steps: stepsDto,
      checkIn: checkIn ? this.toCheckInDto(checkIn) : null,
    };
  }

  private async actOnStep(
    userId: string,
    routineId: string,
    stepId: string,
    outcome: {
      status: StepCompletionStatus;
      skipReason: SkipReason | null;
      skipNote: string | null;
    },
    now: Date,
  ): Promise<TodayRoutineDto> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.requireOwnedActiveRoutine(
      customer.id,
      routineId,
      [...ROUTINE_STEP_RELATIONS],
      now,
    );
    const step = (routine.steps ?? []).find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException(
        `Không tìm thấy bước ${stepId} trong lộ trình chăm sóc`,
      );
    }

    const today = getVnToday(now);
    const existing = await this.completionRepository.findOne({
      where: {
        routineStepId: step.id,
        sessionDate: today as unknown as Date,
      },
    });

    if (existing) {
      if (existing.status === outcome.status) {
        // idempotent
      } else {
        throw new ConflictException(
          `Bước đã được đánh dấu ${existing.status} cho hôm nay; không thể chuyển sang ${outcome.status}`,
        );
      }
    } else {
      await this.completionRepository.save(
        this.completionRepository.create({
          routineId: routine.id,
          routineStepId: step.id,
          sessionDate: today as unknown as Date,
          period: step.period,
          status: outcome.status,
          skipReason: outcome.skipReason,
          skipNote: outcome.skipNote,
          completedAt: now,
        }),
      );
    }

    const periodSteps = [...(routine.steps ?? [])]
      .filter((s) => s.period === step.period)
      .sort(compareRoutineSteps);

    const [sessionCompletions, usageCompletions, orders] = await Promise.all([
      this.completionRepository.find({
        where: {
          routineId: routine.id,
          sessionDate: today as unknown as Date,
          period: step.period,
        },
      }),
      this.completionRepository.find({
        where: {
          routineId: routine.id,
          status: StepCompletionStatus.COMPLETED,
        },
      }),
      this.orderRepository.find({
        where: {
          customerId: customer.id,
          status: In([...PAID_ORDER_STATUSES]),
          createdAt: MoreThanOrEqual(routine.createdAt),
        },
        relations: ['items'],
      }),
    ]);

    const completionByStep = new Map(
      sessionCompletions.map((c) => [c.routineStepId, c]),
    );

    return this.buildTodayRoutineDto(
      routine,
      periodSteps,
      completionByStep,
      today,
      today,
      this.buildStockContext(
        routine,
        orders,
        this.countCompletedByStep(usageCompletions),
      ),
    );
  }

  private buildTodayRoutineDto(
    routine: Routine,
    periodSteps: RoutineStep[],
    completionByStep: Map<string, RoutineStepCompletion>,
    sessionDate: string,
    today: string,
    stock: StockContext,
  ): TodayRoutineDto {
    const steps = periodSteps.map((step) =>
      this.toTodayStepDto(step, completionByStep.get(step.id) ?? null, stock),
    );
    const progress = progressFromStatuses(steps.map((s) => s.status));
    const actedCount = progress.completedCount + progress.skippedCount;
    const sessionState = deriveSessionState({
      totalCount: progress.totalCount,
      actedCount,
      sessionDate,
      today,
    });

    return {
      id: routine.id,
      type: routine.type,
      status: routine.status,
      title: routine.title,
      description: routine.description,
      sessionState,
      progress,
      steps,
    };
  }

  private toTodayStepDto(
    step: RoutineStep,
    completion: RoutineStepCompletion | null,
    stock: StockContext,
  ): TodayStepDto {
    const base = this.toStepBase(step, stock);
    if (!completion) {
      return {
        ...base,
        status: StepSessionStatus.PENDING,
        completedAt: null,
        skipReason: null,
        skipNote: null,
      };
    }
    return {
      ...base,
      status:
        completion.status === StepCompletionStatus.COMPLETED
          ? StepSessionStatus.COMPLETED
          : StepSessionStatus.SKIPPED,
      completedAt: completion.completedAt,
      skipReason: completion.skipReason,
      skipNote: completion.skipNote,
    };
  }

  private toStepBase(
    step: RoutineStep,
    stock: StockContext,
  ): Omit<TodayStepDto, 'status' | 'completedAt' | 'skipReason' | 'skipNote'> {
    const detail = step.details?.[0];
    const variant = detail?.productVariant;
    let productVariant: RoutineStepProductVariantDto | null = null;
    if (detail?.productVariantId) {
      productVariant = {
        id: detail.productVariantId,
        productId: variant?.productId ?? variant?.product?.id ?? '',
        name: variant?.product?.name ?? detail.productVariantId,
        sku: variant?.sku ?? null,
        imageUrl: variant?.imageUrl ?? null,
      };
    }
    const amountRaw = detail?.amountMl;
    const amountMl =
      amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);
    const resolvedAmountMl = Number.isFinite(amountMl)
      ? (amountMl as number)
      : null;

    const variantId = detail?.productVariantId;
    const estimate = variantId
      ? (stock.estimateByVariant.get(variantId) ?? {
          warning: null,
          remainingMl: null,
          daysLeft: null,
        })
      : { warning: null, remainingMl: null, daysLeft: null };

    return {
      id: step.id,
      name: step.name,
      period: step.period,
      stepOrder: step.stepOrder,
      instructions: step.instructions,
      waitMinutes: step.waitMinutes ?? null,
      dosageText: step.dosageText ?? null,
      amountMl: resolvedAmountMl,
      protocolId: step.stepProtocols?.[0]?.protocolId ?? null,
      productVariant,
      warning: estimate.warning,
      remainingMl: estimate.remainingMl,
      daysLeft: estimate.daysLeft,
    };
  }

  private buildStockContext(
    routine: Routine,
    orders: Order[],
    completedCountByStep: Map<string, number>,
  ): StockContext {
    const usedMlByVariant = new Map<string, number>();
    const dailyUsageMlByVariant = new Map<string, number>();
    const canTrackByVariant = new Map<string, boolean>();
    const bottleMlByVariant = new Map<string, number | null>();

    for (const step of routine.steps ?? []) {
      const detail = step.details?.[0];
      const variantId = detail?.productVariantId;
      if (!variantId) continue;

      if (!bottleMlByVariant.has(variantId)) {
        bottleMlByVariant.set(
          variantId,
          parseMlVolume(detail?.productVariant?.volume ?? null),
        );
      }

      const amountRaw = detail?.amountMl;
      const amountMl =
        amountRaw === null || amountRaw === undefined
          ? null
          : Number(amountRaw);
      if (!Number.isFinite(amountMl) || (amountMl as number) <= 0) {
        continue;
      }

      canTrackByVariant.set(variantId, true);
      dailyUsageMlByVariant.set(
        variantId,
        (dailyUsageMlByVariant.get(variantId) ?? 0) + (amountMl as number),
      );
      const completedCount = completedCountByStep.get(step.id) ?? 0;
      usedMlByVariant.set(
        variantId,
        (usedMlByVariant.get(variantId) ?? 0) +
          completedCount * (amountMl as number),
      );
    }

    const purchasedQtyByVariant = new Map<string, number>();
    for (const order of orders) {
      if (order.createdAt < routine.createdAt) continue;
      for (const item of order.items ?? []) {
        purchasedQtyByVariant.set(
          item.productVariantId,
          (purchasedQtyByVariant.get(item.productVariantId) ?? 0) +
            item.quantity,
        );
      }
    }

    // Fallback: source order exists but line items were not found → assume 1 bottle
    if (routine.sourceOrderId) {
      for (const variantId of canTrackByVariant.keys()) {
        if (!purchasedQtyByVariant.has(variantId)) {
          purchasedQtyByVariant.set(variantId, 1);
        }
      }
    }

    const estimateByVariant = new Map<string, StepStockEstimate>();
    for (const variantId of new Set([
      ...bottleMlByVariant.keys(),
      ...canTrackByVariant.keys(),
    ])) {
      estimateByVariant.set(
        variantId,
        estimateVariantStock({
          bottleMl: bottleMlByVariant.get(variantId) ?? null,
          purchasedQty: purchasedQtyByVariant.get(variantId) ?? 0,
          usedMl: usedMlByVariant.get(variantId) ?? 0,
          dailyUsageMl: dailyUsageMlByVariant.get(variantId) ?? 0,
          canTrackUsage: canTrackByVariant.get(variantId) === true,
        }),
      );
    }

    return {
      purchasedQtyByVariant,
      usedMlByVariant,
      canTrackByVariant,
      estimateByVariant,
    };
  }

  private countCompletedByStep(
    completions: RoutineStepCompletion[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const c of completions) {
      if (c.status !== StepCompletionStatus.COMPLETED) continue;
      map.set(c.routineStepId, (map.get(c.routineStepId) ?? 0) + 1);
    }
    return map;
  }

  private toCheckInDto(checkIn: RoutineCheckIn): CheckInResponseDto {
    const rate =
      checkIn.completionRate === null || checkIn.completionRate === undefined
        ? null
        : Number(checkIn.completionRate);
    return {
      id: checkIn.id,
      routineId: checkIn.routineId,
      checkInDate: toDateString(checkIn.checkInDate),
      period: checkIn.period,
      overallMood: checkIn.overallMood,
      acneLevel: checkIn.acneLevel,
      oilLevel: checkIn.oilLevel,
      rednessLevel: checkIn.rednessLevel,
      moistureLevel: checkIn.moistureLevel,
      completionRate: Number.isFinite(rate) ? rate : null,
      note: checkIn.note,
      sideEffects: (checkIn.sideEffects ?? []).map((se) => ({
        id: se.id,
        type: se.type,
        severity: se.severity,
        note: se.note,
      })),
      createdAt: checkIn.createdAt,
    };
  }

  private assertDateString(value: string): void {
    if (!DATE_RE.test(value)) {
      throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
    }
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException(
        'Không có hồ sơ khách hàng cho người dùng này',
      );
    }
    return customer;
  }

  private async requireOwnedRoutine(
    customerId: string,
    routineId: string,
    relations: string[] = [],
  ): Promise<Routine> {
    const routine = await this.routineRepository.findOne({
      where: { id: routineId },
      relations,
    });
    if (!routine) {
      throw new NotFoundException(
        `Không tìm thấy lộ trình chăm sóc ${routineId}`,
      );
    }
    if (routine.customerId !== customerId) {
      throw new ForbiddenException(
        'Lộ trình chăm sóc thuộc về khách hàng khác',
      );
    }
    return routine;
  }

  private async requireOwnedActiveRoutine(
    customerId: string,
    routineId: string,
    relations: string[] = [],
    now: Date = new Date(),
  ): Promise<Routine> {
    const routine = await this.requireOwnedRoutine(
      customerId,
      routineId,
      relations,
    );
    await this.expireRoutineIfPhaseEnded(routine, now);
    if (routine.status !== RoutineStatus.ACTIVE) {
      throw new BadRequestException(
        'Lộ trình chăm sóc không ở trạng thái ACTIVE',
      );
    }
    return routine;
  }

  /**
   * Completes ACTIVE expert routines whose linked phase endDate is before today
   * (Asia/Ho_Chi_Minh). Phases without endDate are not calendar-expired.
   */
  private async completeExpiredPhaseRoutines(
    customerId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const today = getVnToday(now);
    const routines = await this.routineRepository.find({
      where: { customerId, status: RoutineStatus.ACTIVE },
      relations: ['treatmentPhase'],
    });
    for (const routine of routines) {
      if (this.shouldCompleteForPhaseEndDate(routine, today)) {
        routine.status = RoutineStatus.COMPLETED;
        await this.routineRepository.save(routine);
      }
    }
  }

  private async expireRoutineIfPhaseEnded(
    routine: Routine,
    now: Date = new Date(),
  ): Promise<void> {
    if (routine.status !== RoutineStatus.ACTIVE || !routine.treatmentPhaseId) {
      return;
    }
    let phase = routine.treatmentPhase;
    if (!phase) {
      const loaded = await this.routineRepository.findOne({
        where: { id: routine.id },
        relations: ['treatmentPhase'],
      });
      phase = loaded?.treatmentPhase ?? null;
      if (loaded) {
        routine.treatmentPhase = phase;
      }
    }
    const today = getVnToday(now);
    if (this.shouldCompleteForPhaseEndDate(routine, today)) {
      routine.status = RoutineStatus.COMPLETED;
      await this.routineRepository.save(routine);
    }
  }

  private shouldCompleteForPhaseEndDate(
    routine: Routine,
    today: string,
  ): boolean {
    const endDate = routine.treatmentPhase?.endDate;
    if (!endDate) return false;
    return toDateString(endDate) < today;
  }
}
