import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order } from '../commerce/order.entity';
import { OrderStatus } from '../commerce/enums';
import { TreatmentPhaseStatus } from '../treatments/enums';
import { Customer } from '../users/customer.entity';
import {
  CheckInMood,
  EmptyRoutineReason,
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  SessionState,
  SideEffectType,
  SkipReason,
  StepCompletionStatus,
  StepSessionStatus,
  StockWarningLevel,
} from './enums';
import { RoutineCheckIn } from './routine-check-in.entity';
import { RoutineSideEffect } from './routine-side-effect.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';
import { RoutineStep } from './routine-step.entity';
import { RoutineTrackingService } from './routine-tracking.service';
import { Routine } from './routine.entity';

describe('RoutineTrackingService', () => {
  let service: RoutineTrackingService;
  let routineRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let stepRepository: { find: jest.Mock };
  let completionRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let checkInRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let sideEffectRepository: { create: jest.Mock; save: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let orderRepository: { find: jest.Mock };

  const now = new Date('2026-07-22T03:00:00.000Z'); // 10:00 VN → MORNING
  const today = '2026-07-22';

  const customer = { id: 'cust-1', userId: 'user-1' } as Customer;

  const morningSteps = [
    {
      id: 'step-1',
      name: 'Cleanser',
      period: RoutinePeriod.MORNING,
      stepOrder: 1,
      instructions: 'Wash',
      waitMinutes: 0,
      dosageText: '1 pump',
      details: [],
      stepProtocols: [],
    },
    {
      id: 'step-2',
      name: 'Toner',
      period: RoutinePeriod.MORNING,
      stepOrder: 2,
      instructions: 'Tone',
      waitMinutes: 1,
      dosageText: '2 drops',
      details: [],
      stepProtocols: [],
    },
  ];

  const activeRoutine = {
    id: 'routine-1',
    customerId: 'cust-1',
    type: RoutineType.AI_RECOMMENDED,
    status: RoutineStatus.ACTIVE,
    title: 'AM/PM',
    description: null,
    sourceOrderId: null as string | null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    steps: [
      ...morningSteps,
      {
        id: 'step-e1',
        name: 'Serum',
        period: RoutinePeriod.EVENING,
        stepOrder: 1,
        instructions: 'Night',
        waitMinutes: null,
        dosageText: null,
        details: [],
        stepProtocols: [],
      },
    ],
  };

  beforeEach(async () => {
    routineRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
    };
    stepRepository = { find: jest.fn() };
    completionRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'comp-1', ...x })),
    };
    checkInRepository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'ci-1', createdAt: now, ...x })),
    };
    sideEffectRepository = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };
    orderRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutineTrackingService,
        { provide: getRepositoryToken(Routine), useValue: routineRepository },
        {
          provide: getRepositoryToken(RoutineStep),
          useValue: stepRepository,
        },
        {
          provide: getRepositoryToken(RoutineStepCompletion),
          useValue: completionRepository,
        },
        {
          provide: getRepositoryToken(RoutineCheckIn),
          useValue: checkInRepository,
        },
        {
          provide: getRepositoryToken(RoutineSideEffect),
          useValue: sideEffectRepository,
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepository,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: orderRepository,
        },
      ],
    }).compile();

    service = module.get(RoutineTrackingService);
  });

  describe('getToday', () => {
    it('returns EMPTY + NO_ACTIVE_ROUTINE when none', async () => {
      routineRepository.find.mockResolvedValue([]);
      const result = await service.getToday('user-1', undefined, now);
      expect(result.sessionState).toBe(SessionState.EMPTY);
      expect(result.reason).toBe(EmptyRoutineReason.NO_ACTIVE_ROUTINE);
      expect(result.routines).toEqual([]);
      expect(result.period).toBe(RoutinePeriod.MORNING);
      expect(result.date).toBe(today);
    });

    it('returns all ACTIVE routines for the period', async () => {
      const second = {
        ...activeRoutine,
        id: 'routine-2',
        title: 'Expert',
        type: RoutineType.EXPERT_PRESCRIBED,
      };
      routineRepository.find.mockResolvedValue([activeRoutine, second]);
      const result = await service.getToday(
        'user-1',
        RoutinePeriod.MORNING,
        now,
      );
      expect(result.routines).toHaveLength(2);
      expect(result.routines[0].sessionState).toBe(SessionState.NOT_STARTED);
      expect(result.routines[0].steps).toHaveLength(2);
      expect(
        result.routines[0].steps.every(
          (s) => s.status === StepSessionStatus.PENDING,
        ),
      ).toBe(true);
      expect(result.routines[0].steps[0].warning).toBeNull();
      expect(result.routines[0].steps[0].remainingMl).toBeNull();
      expect(result.routines[0].steps[0].daysLeft).toBeNull();
    });

    it('completes phase routines past endDate and excludes them from today', async () => {
      const expired = {
        ...activeRoutine,
        id: 'routine-exp',
        type: RoutineType.EXPERT_PRESCRIBED,
        treatmentPhaseId: 'phase-1',
        treatmentPhase: {
          endDate: new Date('2026-07-01T00:00:00.000Z'),
          status: TreatmentPhaseStatus.ACTIVE,
        },
      };
      const stillOk = {
        ...activeRoutine,
        id: 'routine-ok',
        type: RoutineType.EXPERT_PRESCRIBED,
        treatmentPhaseId: 'phase-2',
        treatmentPhase: {
          endDate: new Date('2026-08-01T00:00:00.000Z'),
          status: TreatmentPhaseStatus.ACTIVE,
        },
      };
      routineRepository.find
        .mockResolvedValueOnce([expired, stillOk])
        .mockResolvedValueOnce([stillOk]);

      const result = await service.getToday(
        'user-1',
        RoutinePeriod.MORNING,
        now,
      );

      expect(routineRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'routine-exp',
          status: RoutineStatus.COMPLETED,
        }),
      );
      expect(result.routines).toHaveLength(1);
      expect(result.routines[0].id).toBe('routine-ok');
    });

    it('warns LOW from on-the-fly stock estimate and clears after repurchase', async () => {
      const stockStep = {
        id: 'step-stock',
        name: 'Serum',
        period: RoutinePeriod.MORNING,
        stepOrder: 1,
        instructions: 'Apply',
        waitMinutes: 0,
        dosageText: '1ml',
        details: [
          {
            productVariantId: 'var-1',
            amountMl: 1,
            productVariant: {
              id: 'var-1',
              productId: 'prod-1',
              volume: '30ml',
              sku: 'SKU-1',
              imageUrl: null,
              product: { id: 'prod-1', name: 'Serum A' },
            },
          },
        ],
        stepProtocols: [],
      };
      const routine = {
        ...activeRoutine,
        sourceOrderId: 'order-1',
        steps: [stockStep],
      };
      routineRepository.find.mockResolvedValue([routine]);

      // 25 completed uses of 1ml on 30ml → 5ml left → 5 days → LOW
      completionRepository.find
        .mockResolvedValueOnce([]) // session completions
        .mockResolvedValueOnce(
          Array.from({ length: 25 }, (_, i) => ({
            routineStepId: 'step-stock',
            status: StepCompletionStatus.COMPLETED,
            id: `c-${i}`,
          })),
        );

      orderRepository.find.mockResolvedValue([
        {
          id: 'order-1',
          createdAt: new Date('2026-07-01T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-1', quantity: 1 }],
        },
      ]);

      const low = await service.getToday('user-1', RoutinePeriod.MORNING, now);
      expect(low.routines[0].steps[0].warning).toBe(StockWarningLevel.LOW);
      expect(low.routines[0].steps[0].remainingMl).toBe(5);
      expect(low.routines[0].steps[0].daysLeft).toBe(5);
      expect(low.routines[0].steps[0].productVariant).toEqual({
        id: 'var-1',
        productId: 'prod-1',
        name: 'Serum A',
        sku: 'SKU-1',
        imageUrl: null,
      });

      // Second PAID order restores stock
      routineRepository.find.mockResolvedValue([routine]);
      completionRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce(
        Array.from({ length: 25 }, (_, i) => ({
          routineStepId: 'step-stock',
          status: StepCompletionStatus.COMPLETED,
          id: `c-${i}`,
        })),
      );
      orderRepository.find.mockResolvedValue([
        {
          id: 'order-1',
          createdAt: new Date('2026-07-01T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-1', quantity: 1 }],
        },
        {
          id: 'order-2',
          createdAt: new Date('2026-07-20T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-1', quantity: 1 }],
        },
      ]);

      const ok = await service.getToday('user-1', RoutinePeriod.MORNING, now);
      expect(ok.routines[0].steps[0].warning).toBeNull();
      expect(ok.routines[0].steps[0].remainingMl).toBe(35);
      expect(ok.routines[0].steps[0].daysLeft).toBe(35);
    });

    it('shares the same stock warning for AM and PM when variant matches', async () => {
      const sharedVariant = {
        id: 'var-shared',
        productId: 'prod-shared',
        volume: '30ml',
        sku: 'SKU-S',
        imageUrl: null,
        product: { id: 'prod-shared', name: 'Shared' },
      };
      const am = {
        id: 'step-am',
        name: 'AM',
        period: RoutinePeriod.MORNING,
        stepOrder: 1,
        instructions: null,
        waitMinutes: null,
        dosageText: null,
        details: [
          {
            productVariantId: 'var-shared',
            amountMl: 1,
            productVariant: sharedVariant,
          },
        ],
        stepProtocols: [],
      };
      const pm = {
        id: 'step-pm',
        name: 'PM',
        period: RoutinePeriod.EVENING,
        stepOrder: 1,
        instructions: null,
        waitMinutes: null,
        dosageText: null,
        details: [
          {
            productVariantId: 'var-shared',
            amountMl: 1,
            productVariant: sharedVariant,
          },
        ],
        stepProtocols: [],
      };
      const routine = {
        ...activeRoutine,
        sourceOrderId: 'order-1',
        steps: [am, pm],
      };
      routineRepository.find.mockResolvedValue([routine]);
      orderRepository.find.mockResolvedValue([
        {
          id: 'order-1',
          createdAt: new Date('2026-07-01T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-shared', quantity: 1 }],
        },
      ]);

      // Uneven usage: AM 20 completes, PM 5 → shared remaining 5ml; dailyUsage 2 → 2 days → LOW
      completionRepository.find
        .mockResolvedValueOnce([]) // session
        .mockResolvedValueOnce([
          ...Array.from({ length: 20 }, (_, i) => ({
            routineStepId: 'step-am',
            status: StepCompletionStatus.COMPLETED,
            id: `am-${i}`,
          })),
          ...Array.from({ length: 5 }, (_, i) => ({
            routineStepId: 'step-pm',
            status: StepCompletionStatus.COMPLETED,
            id: `pm-${i}`,
          })),
        ]);

      const morning = await service.getToday(
        'user-1',
        RoutinePeriod.MORNING,
        now,
      );
      expect(morning.routines[0].steps[0].remainingMl).toBe(5);
      expect(morning.routines[0].steps[0].daysLeft).toBe(2);
      expect(morning.routines[0].steps[0].warning).toBe(StockWarningLevel.LOW);

      routineRepository.find.mockResolvedValue([routine]);
      completionRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          ...Array.from({ length: 20 }, (_, i) => ({
            routineStepId: 'step-am',
            status: StepCompletionStatus.COMPLETED,
            id: `am-${i}`,
          })),
          ...Array.from({ length: 5 }, (_, i) => ({
            routineStepId: 'step-pm',
            status: StepCompletionStatus.COMPLETED,
            id: `pm-${i}`,
          })),
        ]);
      orderRepository.find.mockResolvedValue([
        {
          id: 'order-1',
          createdAt: new Date('2026-07-01T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-shared', quantity: 1 }],
        },
      ]);

      const evening = await service.getToday(
        'user-1',
        RoutinePeriod.EVENING,
        now,
      );
      expect(evening.routines[0].steps[0].remainingMl).toBe(5);
      expect(evening.routines[0].steps[0].daysLeft).toBe(2);
      expect(evening.routines[0].steps[0].warning).toBe(StockWarningLevel.LOW);
    });

    it('starts shared AM+PM bottle at full remaining (not split)', async () => {
      const sharedVariant = {
        id: 'var-shared',
        productId: 'prod-shared',
        volume: '30ml',
        sku: 'SKU-S',
        imageUrl: null,
        product: { id: 'prod-shared', name: 'Shared' },
      };
      routineRepository.find.mockResolvedValue([
        {
          ...activeRoutine,
          sourceOrderId: 'order-1',
          steps: [
            {
              id: 'step-am',
              name: 'AM',
              period: RoutinePeriod.MORNING,
              stepOrder: 1,
              instructions: null,
              waitMinutes: null,
              dosageText: null,
              details: [
                {
                  productVariantId: 'var-shared',
                  amountMl: 1,
                  productVariant: sharedVariant,
                },
              ],
              stepProtocols: [],
            },
            {
              id: 'step-pm',
              name: 'PM',
              period: RoutinePeriod.EVENING,
              stepOrder: 1,
              instructions: null,
              waitMinutes: null,
              dosageText: null,
              details: [
                {
                  productVariantId: 'var-shared',
                  amountMl: 1,
                  productVariant: sharedVariant,
                },
              ],
              stepProtocols: [],
            },
          ],
        },
      ]);
      orderRepository.find.mockResolvedValue([
        {
          id: 'order-1',
          createdAt: new Date('2026-07-01T01:00:00.000Z'),
          status: OrderStatus.PAID,
          items: [{ productVariantId: 'var-shared', quantity: 1 }],
        },
      ]);

      const result = await service.getToday(
        'user-1',
        RoutinePeriod.MORNING,
        now,
      );
      expect(result.routines[0].steps[0].remainingMl).toBe(30);
      expect(result.routines[0].steps[0].daysLeft).toBe(15);
      expect(result.routines[0].steps[0].warning).toBeNull();
    });
  });

  describe('completeStep / skipStep', () => {
    beforeEach(() => {
      routineRepository.findOne.mockResolvedValue(activeRoutine);
    });

    it('completes a step and returns updated progress', async () => {
      completionRepository.findOne.mockResolvedValue(null);
      completionRepository.find.mockResolvedValue([
        {
          routineStepId: 'step-1',
          status: StepCompletionStatus.COMPLETED,
          completedAt: now,
          skipReason: null,
          skipNote: null,
        },
      ]);

      const result = await service.completeStep(
        'user-1',
        'routine-1',
        'step-1',
        now,
      );
      expect(result.progress).toEqual({
        completedCount: 1,
        skippedCount: 0,
        totalCount: 2,
        completionRate: 50,
      });
      expect(result.sessionState).toBe(SessionState.IN_PROGRESS);
      expect(result.steps[0].status).toBe(StepSessionStatus.COMPLETED);
      expect(completionRepository.save).toHaveBeenCalled();
    });

    it('is idempotent when completing twice', async () => {
      completionRepository.findOne.mockResolvedValue({
        status: StepCompletionStatus.COMPLETED,
      });
      completionRepository.find.mockResolvedValue([
        {
          routineStepId: 'step-1',
          status: StepCompletionStatus.COMPLETED,
          completedAt: now,
          skipReason: null,
          skipNote: null,
        },
      ]);
      await service.completeStep('user-1', 'routine-1', 'step-1', now);
      expect(completionRepository.save).not.toHaveBeenCalled();
    });

    it('conflicts when flipping COMPLETED to SKIPPED', async () => {
      completionRepository.findOne.mockResolvedValue({
        status: StepCompletionStatus.COMPLETED,
      });
      await expect(
        service.skipStep(
          'user-1',
          'routine-1',
          'step-1',
          { reason: SkipReason.FORGOT },
          now,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('requires note for OTHER skip', async () => {
      await expect(
        service.skipStep(
          'user-1',
          'routine-1',
          'step-1',
          { reason: SkipReason.OTHER },
          now,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids other customer routine', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        customerId: 'other',
      });
      await expect(
        service.completeStep('user-1', 'routine-1', 'step-1', now),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects inactive routine', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        status: RoutineStatus.PAUSED,
      });
      await expect(
        service.completeStep('user-1', 'routine-1', 'step-1', now),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects complete when phase endDate has passed', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        type: RoutineType.EXPERT_PRESCRIBED,
        treatmentPhaseId: 'phase-1',
        treatmentPhase: { endDate: new Date('2026-07-01T00:00:00.000Z') },
      });
      await expect(
        service.completeStep('user-1', 'routine-1', 'step-1', now),
      ).rejects.toThrow(BadRequestException);
      expect(routineRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: RoutineStatus.COMPLETED }),
      );
    });

    it('404 when step missing', async () => {
      await expect(
        service.completeStep('user-1', 'routine-1', 'missing', now),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCheckIn', () => {
    beforeEach(() => {
      routineRepository.findOne.mockResolvedValue(activeRoutine);
      stepRepository.find.mockResolvedValue(morningSteps);
      completionRepository.find.mockResolvedValue([
        { routineStepId: 'step-1', status: StepCompletionStatus.COMPLETED },
        { routineStepId: 'step-2', status: StepCompletionStatus.SKIPPED },
      ]);
      checkInRepository.findOneOrFail.mockResolvedValue({
        id: 'ci-1',
        routineId: 'routine-1',
        checkInDate: today,
        period: RoutinePeriod.MORNING,
        overallMood: CheckInMood.OK,
        acneLevel: 1,
        oilLevel: null,
        rednessLevel: null,
        moistureLevel: null,
        completionRate: 50,
        note: null,
        sideEffects: [
          {
            id: 'se-1',
            type: SideEffectType.ITCHING,
            severity: 1,
            note: null,
          },
        ],
        createdAt: now,
      });
    });

    it('stores computed completionRate and side effects', async () => {
      const result = await service.createCheckIn(
        'user-1',
        'routine-1',
        {
          overallMood: CheckInMood.OK,
          acneLevel: 1,
          sideEffects: [{ type: SideEffectType.ITCHING, severity: 1 }],
        },
        now,
      );
      expect(checkInRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ completionRate: 50 }),
      );
      expect(sideEffectRepository.save).toHaveBeenCalled();
      expect(result.sideEffects).toHaveLength(1);
    });

    it('updates existing check-in on duplicate check-in (e.g. side-effect report)', async () => {
      checkInRepository.findOne.mockResolvedValue({
        id: 'exists',
        routineId: 'routine-1',
      });
      const result = await service.createCheckIn(
        'user-1',
        'routine-1',
        { overallMood: 'BAD' as any },
        now,
      );
      expect(checkInRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('cancelAiRoutine', () => {
    it('sets owned ACTIVE AI_RECOMMENDED to COMPLETED', async () => {
      routineRepository.findOne.mockResolvedValue({ ...activeRoutine });
      await service.cancelAiRoutine('user-1', 'routine-1');
      expect(routineRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'routine-1',
          status: RoutineStatus.COMPLETED,
        }),
      );
    });

    it('rejects EXPERT_PRESCRIBED', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        type: RoutineType.EXPERT_PRESCRIBED,
      });
      await expect(
        service.cancelAiRoutine('user-1', 'routine-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-ACTIVE', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        status: RoutineStatus.COMPLETED,
      });
      await expect(
        service.cancelAiRoutine('user-1', 'routine-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids other customer routine', async () => {
      routineRepository.findOne.mockResolvedValue({
        ...activeRoutine,
        customerId: 'other',
      });
      await expect(
        service.cancelAiRoutine('user-1', 'routine-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
