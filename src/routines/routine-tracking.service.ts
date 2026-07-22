import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
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
import {
  DayHistoryStatus,
  EmptyRoutineReason,
  RoutinePeriod,
  RoutineStatus,
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
  getVnToday,
  progressFromStatuses,
  toDateString,
  vnDateFromUtcDate,
} from './routine-tracking.rules';
import { Routine } from './routine.entity';

const ROUTINE_STEP_RELATIONS = [
  'steps',
  'steps.stepProtocols',
  'steps.details',
  'steps.details.productVariant',
  'steps.details.productVariant.product',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  ) {}

  async getToday(
    userId: string,
    period?: RoutinePeriod,
    now: Date = new Date(),
  ): Promise<TodayRoutinesResponseDto> {
    const customer = await this.requireCustomer(userId);
    const resolvedPeriod = period ?? defaultPeriodForNow(now);
    const today = getVnToday(now);

    const routines = await this.routineRepository.find({
      where: { customerId: customer.id, status: RoutineStatus.ACTIVE },
      relations: [...ROUTINE_STEP_RELATIONS],
      order: { createdAt: 'DESC' },
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
    const completions = await this.completionRepository.find({
      where: {
        routineId: In(routineIds),
        sessionDate: today as unknown as Date,
        period: resolvedPeriod,
      },
    });
    const completionByStep = new Map(
      completions.map((c) => [c.routineStepId, c]),
    );

    const todayRoutines: TodayRoutineDto[] = [];
    for (const routine of routines) {
      const periodSteps = [...(routine.steps ?? [])]
        .filter((s) => s.period === resolvedPeriod)
        .sort(compareRoutineSteps);

      // Skip routines with no steps in this period from the list? Plan says all ACTIVE.
      // Include them with empty steps / NOT_STARTED.
      todayRoutines.push(
        this.buildTodayRoutineDto(
          routine,
          periodSteps,
          completionByStep,
          today,
          today,
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
      throw new BadRequestException('note is required when reason is OTHER');
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
    );
    const today = getVnToday(now);
    const date = dto.date ?? today;
    this.assertDateString(date);
    if (date !== today) {
      throw new BadRequestException(
        'Check-in date must be today (Asia/Ho_Chi_Minh) for MVP',
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
    if (existing) {
      throw new ConflictException(
        `Check-in already exists for ${date} ${period}`,
      );
    }

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

    const checkIn = await this.checkInRepository.save(
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

    const sideEffects = dto.sideEffects ?? [];
    if (sideEffects.length > 0) {
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
      throw new BadRequestException('from must be <= to');
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
      throw new BadRequestException('from must be <= to');
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

    const completions = await this.completionRepository.find({
      where: {
        routineId: routine.id,
        sessionDate: date as unknown as Date,
        period: resolvedPeriod,
      },
    });
    const completionByStep = new Map(
      completions.map((c) => [c.routineStepId, c]),
    );

    const stepsDto = periodSteps.map((step) =>
      this.toTodayStepDto(step, completionByStep.get(step.id) ?? null),
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
    );
    const step = (routine.steps ?? []).find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException(`Step ${stepId} not found on routine`);
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
          `Step already marked ${existing.status} for today; cannot change to ${outcome.status}`,
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
    const completions = await this.completionRepository.find({
      where: {
        routineId: routine.id,
        sessionDate: today as unknown as Date,
        period: step.period,
      },
    });
    const completionByStep = new Map(
      completions.map((c) => [c.routineStepId, c]),
    );

    return this.buildTodayRoutineDto(
      routine,
      periodSteps,
      completionByStep,
      today,
      today,
    );
  }

  private buildTodayRoutineDto(
    routine: Routine,
    periodSteps: RoutineStep[],
    completionByStep: Map<string, RoutineStepCompletion>,
    sessionDate: string,
    today: string,
  ): TodayRoutineDto {
    const steps = periodSteps.map((step) =>
      this.toTodayStepDto(step, completionByStep.get(step.id) ?? null),
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
  ): TodayStepDto {
    const base = this.toStepBase(step);
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
  ): Omit<TodayStepDto, 'status' | 'completedAt' | 'skipReason' | 'skipNote'> {
    const detail = step.details?.[0];
    const variant = detail?.productVariant;
    let productVariant: RoutineStepProductVariantDto | null = null;
    if (detail?.productVariantId) {
      productVariant = {
        id: detail.productVariantId,
        name: variant?.product?.name ?? detail.productVariantId,
        sku: variant?.sku ?? null,
        imageUrl: null,
      };
    }
    const amountRaw = detail?.amountMl;
    const amountMl =
      amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);

    return {
      id: step.id,
      name: step.name,
      period: step.period,
      stepOrder: step.stepOrder,
      instructions: step.instructions,
      waitMinutes: step.waitMinutes ?? null,
      dosageText: step.dosageText ?? null,
      amountMl: Number.isFinite(amountMl as number) ? amountMl : null,
      protocolId: step.stepProtocols?.[0]?.protocolId ?? null,
      productVariant,
    };
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
      completionRate: Number.isFinite(rate as number) ? rate : null,
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
      throw new BadRequestException(`Invalid date: ${value}`);
    }
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
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
      throw new NotFoundException(`Routine ${routineId} not found`);
    }
    if (routine.customerId !== customerId) {
      throw new ForbiddenException('Routine belongs to another customer');
    }
    return routine;
  }

  private async requireOwnedActiveRoutine(
    customerId: string,
    routineId: string,
    relations: string[] = [],
  ): Promise<Routine> {
    const routine = await this.requireOwnedRoutine(
      customerId,
      routineId,
      relations,
    );
    if (routine.status !== RoutineStatus.ACTIVE) {
      throw new BadRequestException('Routine is not ACTIVE');
    }
    return routine;
  }
}
