import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConsultationStatus } from '../consultations/enums';
import { TimeOfUse } from '../ingredients/enums';
import { ConflictSeverity } from '../products/enums/conflict-severity.enum';
import {
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  StepCompletionStatus,
} from '../routines/enums';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { RoutineStepProtocol } from '../routines/routine-step-protocol.entity';
import { RoutineStep } from '../routines/routine-step.entity';
import { Routine } from '../routines/routine.entity';
import {
  TreatmentEventType,
  TreatmentPhaseStatus,
  TreatmentStatus,
} from './enums';
import { TreatmentPhase } from './treatment-phase.entity';
import { TreatmentsService } from './treatments.service';

describe('TreatmentsService phase activation rules', () => {
  function makeService(overrides: {
    phase?: Record<string, unknown>;
    routines?: Array<Record<string, unknown>>;
    activeOthers?: Array<Record<string, unknown>>;
    prevPhaseRoutines?: Array<Record<string, unknown>>;
  }) {
    const phase = {
      id: 'phase-1',
      treatmentId: 't-1',
      status: TreatmentPhaseStatus.PENDING,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-09-01'),
      notes: null,
      noteByExpert: 'Why this phase',
      title: 'Phase 1',
      phaseType: 'ACTIVE_TREATMENT',
      phaseOrder: 0,
      goals: null,
      priceVnd: '100000',
      achievements: null,
      phaseIngredients: [],
      phaseProducts: [],
      routines: [],
      treatment: {
        id: 't-1',
        expertId: 'expert-1',
        status: TreatmentStatus.ACTIVE,
        paidAt: new Date(),
        customerId: 'cust-1',
      },
      ...overrides.phase,
    };

    const routineRepo = {
      find: jest.fn().mockResolvedValue(overrides.routines ?? []),
    };

    const phaseRepo = {
      find: jest.fn().mockResolvedValue(overrides.activeOthers ?? []),
      findOne: jest.fn().mockResolvedValue(phase),
    };

    const expertRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
    };

    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(phase.treatment),
    };

    const savedRows: Array<{ entity: unknown; row: Record<string, unknown> }> =
      [];

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          find: jest
            .fn()
            .mockResolvedValueOnce(overrides.activeOthers ?? [])
            .mockResolvedValue(overrides.prevPhaseRoutines ?? []),
          save: jest.fn((entity: unknown, row: Record<string, unknown>) => {
            savedRows.push({ entity, row });
            return Promise.resolve(row);
          }),
        };
        return cb(manager);
      }),
    };

    const escrowService = {
      holdTreatmentPhaseWithManager: jest
        .fn()
        .mockResolvedValue({ id: 'hold-1' }),
      findHeldByTreatmentPhase: jest.fn().mockResolvedValue(null),
      findHeldByTreatment: jest.fn().mockResolvedValue([]),
      refundWithManager: jest.fn().mockResolvedValue(null),
      releaseWithManager: jest.fn().mockResolvedValue(null),
    };

    const service = new TreatmentsService(
      treatmentRepo as never,
      phaseRepo as never,
      {} as never,
      {} as never,
      {} as never,
      expertRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      routineRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      escrowService as never,
      dataSource as never,
      {} as never,
    );

    (
      service as unknown as { loadPhase: (id: string) => Promise<unknown> }
    ).loadPhase = async () => phase;
    (
      service as unknown as {
        requireExpertTreatment: () => Promise<unknown>;
      }
    ).requireExpertTreatment = async () => ({
      expert: { id: 'expert-1' },
      treatment: phase.treatment,
    });
    (service as unknown as { toPhaseDto: (p: unknown) => unknown }).toPhaseDto =
      (p) => p;

    return { service, dataSource, phase, savedRows };
  }

  it('rejects activate when DRAFT routines exist', async () => {
    const { service } = makeService({
      routines: [{ id: 'r-1', status: 'DRAFT' }],
    });

    await expect(service.activatePhase('u-e', 'phase-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows activate with no routine when dates present', async () => {
    const { service, dataSource } = makeService({ routines: [] });
    await service.activatePhase('u-e', 'phase-1');
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('allows activate when routines are saved ACTIVE', async () => {
    const { service, dataSource } = makeService({
      routines: [{ id: 'r-1', status: 'ACTIVE' }],
    });
    await service.activatePhase('u-e', 'phase-1');
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('completes ACTIVE routines on previous phase when activating next', async () => {
    const prevRoutine = {
      id: 'r-prev',
      status: RoutineStatus.ACTIVE,
      treatmentPhaseId: 'phase-0',
    };
    const { service, savedRows } = makeService({
      routines: [{ id: 'r-1', status: RoutineStatus.ACTIVE }],
      activeOthers: [
        {
          id: 'phase-0',
          status: TreatmentPhaseStatus.ACTIVE,
          treatmentId: 't-1',
        },
      ],
      prevPhaseRoutines: [prevRoutine],
    });

    await service.activatePhase('u-e', 'phase-1');

    expect(
      savedRows.some(
        (s) =>
          s.entity === TreatmentPhase &&
          s.row.id === 'phase-0' &&
          s.row.status === TreatmentPhaseStatus.COMPLETED,
      ),
    ).toBe(true);
    expect(
      savedRows.some(
        (s) =>
          s.entity === Routine &&
          s.row.id === 'r-prev' &&
          s.row.status === RoutineStatus.COMPLETED,
      ),
    ).toBe(true);
  });
});

describe('TreatmentsService submit / cancel / chart', () => {
  function buildService(deps: {
    treatmentRepo?: Record<string, unknown>;
    phaseRepo?: Record<string, unknown>;
    eventRepo?: Record<string, unknown>;
    expertRepo?: Record<string, unknown>;
    customerRepo?: Record<string, unknown>;
    consultationRepo?: Record<string, unknown>;
    routineRepo?: Record<string, unknown>;
    completionRepo?: Record<string, unknown>;
    walletService?: Record<string, unknown>;
    escrowService?: Record<string, unknown>;
    dataSource?: Record<string, unknown>;
  }) {
    const defaultDataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          save: jest.fn(async (_entity: unknown, row: unknown) => row),
          find: jest.fn().mockResolvedValue([]),
        };
        return cb(manager);
      }),
    };
    const defaultEscrow = {
      holdTreatmentPhaseWithManager: jest
        .fn()
        .mockResolvedValue({ id: 'hold-1' }),
      findHeldByTreatmentPhase: jest.fn().mockResolvedValue(null),
      findHeldByTreatment: jest.fn().mockResolvedValue([]),
      refundWithManager: jest.fn().mockImplementation(async (_m, holdId) => ({
        id: holdId,
        refundTransactionId: 'tx-refund',
        amountVnd: '200000',
      })),
      releaseWithManager: jest.fn().mockResolvedValue(null),
    };

    return new TreatmentsService(
      (deps.treatmentRepo ?? {}) as never,
      (deps.phaseRepo ?? {}) as never,
      {} as never,
      {} as never,
      (deps.eventRepo ?? {}) as never,
      (deps.expertRepo ?? {}) as never,
      (deps.customerRepo ?? {}) as never,
      (deps.consultationRepo ?? {}) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      (deps.routineRepo ?? { find: jest.fn().mockResolvedValue([]) }) as never,
      {} as never,
      (deps.completionRepo ?? {
        find: jest.fn().mockResolvedValue([]),
      }) as never,
      {} as never,
      {} as never,
      (deps.walletService ?? {
        debitWithManager: jest.fn().mockResolvedValue({ id: 'tx-pay' }),
        creditWithManager: jest.fn().mockResolvedValue({ id: 'tx-refund' }),
      }) as never,
      (deps.escrowService ?? defaultEscrow) as never,
      (deps.dataSource ?? defaultDataSource) as never,
      {} as never,
    );
  }

  it('rejects submit when a phase is missing noteByExpert', async () => {
    const treatment = {
      id: 't-1',
      expertId: 'expert-1',
      status: TreatmentStatus.DRAFT,
      paidAt: null,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-11-01'),
    };
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue({
          ...treatment,
          phases: [],
        }),
        save: jest.fn(),
      },
      phaseRepo: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            noteByExpert: null,
            priceVnd: '100000',
          },
        ]),
      },
    });

    await expect(service.submitForPayment('u-e', 't-1')).rejects.toThrow(
      /noteByExpert/,
    );
  });

  it('sets submittedAt on successful submit', async () => {
    const treatment = {
      id: 't-1',
      expertId: 'expert-1',
      status: TreatmentStatus.DRAFT,
      paidAt: null,
      submittedAt: null,
      totalPriceVnd: null,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-11-01'),
    };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue({
        ...treatment,
        phases: [],
      }),
      save: jest.fn(async (row) => row),
    };
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      treatmentRepo,
      phaseRepo: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            noteByExpert: 'Why this phase',
            priceVnd: '100000',
          },
        ]),
      },
    });
    (
      service as unknown as {
        getTreatmentDetail: (id: string) => Promise<unknown>;
      }
    ).getTreatmentDetail = async () => ({
      id: 't-1',
      submittedAt: treatment.submittedAt,
      totalPriceVnd: treatment.totalPriceVnd,
    });

    await service.submitForPayment('u-e', 't-1');

    expect(treatmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        totalPriceVnd: '100000',
        submittedAt: expect.any(Date),
      }),
    );
  });

  it('rejects pay when submittedAt is null', async () => {
    const treatment = {
      id: 't-1',
      customerId: 'cust-1',
      status: TreatmentStatus.DRAFT,
      paidAt: null,
      submittedAt: null,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-11-01'),
      phases: [{ id: 'p-1', priceVnd: '100000' }],
    };
    const service = buildService({
      customerRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'u-c' }),
      },
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatment),
      },
      walletService: {
        debit: jest.fn(),
      },
    });
    (
      service as unknown as {
        loadTreatment: (id: string) => Promise<unknown>;
      }
    ).loadTreatment = async () => treatment;

    await expect(service.payTreatment('u-c', 't-1')).rejects.toThrow(
      /chưa được chuyên gia gửi/,
    );
  });

  it('pays successfully when plan is submitted', async () => {
    const treatment = {
      id: 't-1',
      customerId: 'cust-1',
      clinicId: 'clinic-1',
      expertId: 'expert-1',
      status: TreatmentStatus.DRAFT,
      paidAt: null,
      submittedAt: new Date('2026-08-01T10:00:00Z'),
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-11-01'),
      totalPriceVnd: '100000',
      phases: [{ id: 'p-1', priceVnd: '100000' }],
    };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(treatment),
      save: jest.fn(async (row) => row),
      update: jest.fn(),
    };
    const walletService = {
      debitWithManager: jest.fn().mockResolvedValue({ id: 'tx-pay' }),
    };
    const escrowService = {
      holdTreatmentPhaseWithManager: jest
        .fn()
        .mockResolvedValue({ id: 'hold-1' }),
      findHeldByTreatmentPhase: jest.fn().mockResolvedValue(null),
      findHeldByTreatment: jest.fn().mockResolvedValue([]),
      refundWithManager: jest.fn(),
      releaseWithManager: jest.fn(),
    };
    const service = buildService({
      customerRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'u-c' }),
      },
      treatmentRepo,
      phaseRepo: {
        find: jest.fn().mockResolvedValue([{ id: 'p-1', priceVnd: '100000' }]),
      },
      walletService,
      escrowService,
    });
    (
      service as unknown as {
        loadTreatment: (id: string) => Promise<unknown>;
      }
    ).loadTreatment = async () => treatment;
    (
      service as unknown as {
        getTreatmentDetail: (id: string) => Promise<unknown>;
      }
    ).getTreatmentDetail = async () => ({
      id: 't-1',
      status: TreatmentStatus.ACTIVE,
      paidAt: expect.any(Date),
    });

    await service.payTreatment('u-c', 't-1');

    expect(walletService.debitWithManager).toHaveBeenCalled();
    expect(escrowService.holdTreatmentPhaseWithManager).toHaveBeenCalled();
  });

  it('clears submittedAt when expert edits a phase before pay', async () => {
    const treatment = {
      id: 't-1',
      expertId: 'expert-1',
      status: TreatmentStatus.DRAFT,
      paidAt: null,
      submittedAt: new Date('2026-08-01T10:00:00Z'),
      totalPriceVnd: '100000',
    };
    const phase = {
      id: 'p-1',
      treatmentId: 't-1',
      treatment,
      phaseType: 'ACTIVE_TREATMENT',
      phaseOrder: 0,
      title: 'Phase 1',
      goals: null,
      notes: null,
      noteByExpert: 'Why',
      priceVnd: '100000',
      startDate: null,
      endDate: null,
    };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(treatment),
      update: jest.fn(),
    };
    const phaseRepo = {
      findOne: jest.fn().mockResolvedValue(phase),
      save: jest.fn(async (row) => row),
    };
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      treatmentRepo,
      phaseRepo,
    });
    (
      service as unknown as { loadPhase: (id: string) => Promise<unknown> }
    ).loadPhase = async () => phase;
    (service as unknown as { toPhaseDto: (p: unknown) => unknown }).toPhaseDto =
      (p) => p;

    await service.updatePhase('u-e', 'p-1', { title: 'Updated title' });

    expect(treatmentRepo.update).toHaveBeenCalledWith(
      { id: 't-1' },
      { submittedAt: null, totalPriceVnd: null },
    );
  });

  it('rejects phase pricing edits after customer pays', async () => {
    const treatment = {
      id: 't-1',
      expertId: 'expert-1',
      status: TreatmentStatus.ACTIVE,
      paidAt: new Date(),
      submittedAt: new Date(),
    };
    const phase = {
      id: 'p-1',
      treatmentId: 't-1',
      treatment,
    };
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatment),
      },
      phaseRepo: {
        findOne: jest.fn().mockResolvedValue(phase),
      },
    });
    (
      service as unknown as { loadPhase: (id: string) => Promise<unknown> }
    ).loadPhase = async () => phase;

    await expect(
      service.updatePhase('u-e', 'p-1', { priceVnd: 999999 }),
    ).rejects.toThrow(/Chỉ liệu trình DRAFT chưa thanh toán/);
  });

  it('refunds only PENDING phase fees on mid-plan cancel', async () => {
    const treatment = {
      id: 't-1',
      expertId: 'expert-1',
      customerId: 'cust-1',
      status: TreatmentStatus.ACTIVE,
      paidAt: new Date(),
      phases: [
        {
          id: 'p-done',
          status: TreatmentPhaseStatus.COMPLETED,
          priceVnd: '200000',
        },
        {
          id: 'p-active',
          status: TreatmentPhaseStatus.ACTIVE,
          priceVnd: '300000',
        },
        {
          id: 'p-pending',
          status: TreatmentPhaseStatus.PENDING,
          priceVnd: '150000',
        },
        {
          id: 'p-pending-2',
          status: TreatmentPhaseStatus.PENDING,
          priceVnd: '50000',
        },
      ],
    };

    const walletService = {
      creditWithManager: jest.fn().mockResolvedValue({ id: 'tx-refund' }),
    };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(treatment),
      save: jest.fn(async (row) => row),
    };
    const routineRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'r-1', treatmentPhaseId: 'p-active', status: 'ACTIVE' },
        ]),
      save: jest.fn(async (row) => row),
    };

    const escrowService = {
      findHeldByTreatment: jest.fn().mockResolvedValue([
        { id: 'hold-p1', amountVnd: '150000' },
        { id: 'hold-p2', amountVnd: '50000' },
      ]),
      refundWithManager: jest
        .fn()
        .mockImplementation(async (_m: unknown, holdId: string) => ({
          id: holdId,
          refundTransactionId: 'tx-refund',
        })),
      holdTreatmentPhaseWithManager: jest.fn(),
      findHeldByTreatmentPhase: jest.fn(),
      releaseWithManager: jest.fn(),
    };

    const service = buildService({
      treatmentRepo,
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      customerRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'u-c' }),
      },
      routineRepo,
      walletService,
      escrowService,
    });

    (
      service as unknown as {
        getTreatmentDetail: (id: string) => Promise<unknown>;
      }
    ).getTreatmentDetail = async () => ({
      id: 't-1',
      status: TreatmentStatus.CANCELLED,
      refundedAmountVnd: '200000',
    });

    const result = await service.cancelTreatment(
      'u-e',
      { isExpert: true, isCustomer: false },
      't-1',
      { reason: 'Patient request' },
    );

    expect(escrowService.refundWithManager).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(TreatmentStatus.CANCELLED);
  });

  it('chart productsUsed only includes COMPLETED routine step products', async () => {
    const treatment = {
      id: 't-1',
      title: 'Acne plan',
      expertId: 'expert-1',
      customerId: 'cust-1',
      status: TreatmentStatus.ACTIVE,
      paidAt: new Date(),
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-11-01'),
      sourceConsultationId: null,
      phases: [
        {
          id: 'phase-1',
          phaseType: 'ACTIVE_TREATMENT',
          phaseOrder: 0,
          title: 'Phase 1',
          status: TreatmentPhaseStatus.ACTIVE,
          noteByExpert: 'Inflammation control',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-09-01'),
          notes: null,
          goals: null,
          priceVnd: '100000',
          phaseIngredients: [],
          phaseProducts: [],
          routines: [],
          treatmentId: 't-1',
        },
      ],
    };

    const completionRepo = {
      find: jest.fn().mockResolvedValue([
        {
          status: StepCompletionStatus.COMPLETED,
          sessionDate: new Date('2026-08-10'),
          routine: { treatmentPhaseId: 'phase-1' },
          routineStep: {
            details: [
              {
                productVariantId: 'var-1',
                productVariant: {
                  sku: 'SKU-1',
                  product: { name: 'Serum A' },
                },
              },
            ],
          },
        },
        {
          status: StepCompletionStatus.COMPLETED,
          sessionDate: new Date('2026-08-11'),
          routine: { treatmentPhaseId: 'phase-1' },
          routineStep: {
            details: [
              {
                productVariantId: 'var-1',
                productVariant: {
                  sku: 'SKU-1',
                  product: { name: 'Serum A' },
                },
              },
            ],
          },
        },
      ]),
    };

    const service = buildService({
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatment),
      },
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      eventRepo: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'e-1',
            treatmentId: 't-1',
            type: TreatmentEventType.PROGRESS_PHOTO,
            title: 'Week 2',
            note: null,
            photoUrl: 'https://cdn.example/p.jpg',
            occurredAt: new Date('2026-08-12'),
            createdByExpertId: 'expert-1',
            createdAt: new Date(),
          },
        ]),
      },
      consultationRepo: {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
      },
      completionRepo,
    });

    const chart = await service.getChart(
      'u-e',
      { isExpert: true, isCustomer: false },
      't-1',
    );

    expect(chart.productsUsed).toEqual([
      expect.objectContaining({
        productVariantId: 'var-1',
        productName: 'Serum A',
        sku: 'SKU-1',
        completedCount: 2,
        phaseIds: ['phase-1'],
      }),
    ]);
    expect(chart.progressPhotos).toHaveLength(1);
    expect(chart.phases[0].noteByExpert).toBe('Inflammation control');
  });

  it('allows createTreatment when source consultation is IN_PROGRESS', async () => {
    const treatmentRepo = {
      save: jest.fn(async (row) => ({ ...row, id: 't-new' })),
      findOne: jest.fn().mockResolvedValue({
        id: 't-new',
        customerId: 'cust-1',
        expertId: 'expert-1',
        clinicId: null,
        title: 'Plan',
        description: null,
        status: TreatmentStatus.DRAFT,
        startDate: null,
        endDate: null,
        totalPriceVnd: null,
        paidAt: null,
        paidTransactionId: null,
        sourceConsultationId: 'booking-1',
        cancelledAt: null,
        cancelReason: null,
        cancelledBy: null,
        refundTransactionId: null,
        refundedAmountVnd: null,
        phases: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      create: jest.fn((row) => row),
    };

    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'expert-1',
          userId: 'u-e',
          clinicId: null,
        }),
      },
      customerRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'u-c' }),
      },
      consultationRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'booking-1',
          expertId: 'expert-1',
          customerId: 'cust-1',
          status: ConsultationStatus.IN_PROGRESS,
        }),
      },
      treatmentRepo: {
        ...treatmentRepo,
        create: (row: unknown) => row,
      },
    });

    // TypeORM repo.create is used via this.treatmentRepo.create
    (
      service as unknown as {
        treatmentRepo: { create: (r: unknown) => unknown };
      }
    ).treatmentRepo.create = (row) => row;

    const result = await service.createTreatment('u-e', {
      customerId: 'cust-1',
      title: 'Plan',
      sourceConsultationId: 'booking-1',
    });

    expect(treatmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceConsultationId: 'booking-1',
        status: TreatmentStatus.DRAFT,
      }),
    );
    expect(result.id).toBe('t-new');
  });

  it('rejects createTreatment when source consultation is CONFIRMED', async () => {
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'expert-1',
          userId: 'u-e',
          clinicId: null,
        }),
      },
      customerRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-1', userId: 'u-c' }),
      },
      consultationRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'booking-1',
          expertId: 'expert-1',
          customerId: 'cust-1',
          status: ConsultationStatus.CONFIRMED,
        }),
      },
      treatmentRepo: {
        save: jest.fn(),
        create: jest.fn((row) => row),
      },
    });

    await expect(
      service.createTreatment('u-e', {
        customerId: 'cust-1',
        title: 'Plan',
        sourceConsultationId: 'booking-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TreatmentsService updateEventPhoto', () => {
  function buildService(deps: {
    treatmentRepo?: Record<string, unknown>;
    eventRepo?: Record<string, unknown>;
    expertRepo?: Record<string, unknown>;
    customerRepo?: Record<string, unknown>;
  }) {
    return new TreatmentsService(
      (deps.treatmentRepo ?? {}) as never,
      {} as never,
      {} as never,
      {} as never,
      (deps.eventRepo ?? {}) as never,
      (deps.expertRepo ?? {}) as never,
      (deps.customerRepo ?? {}) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  const treatment = {
    id: 't-1',
    expertId: 'expert-1',
    customerId: 'cust-1',
    status: TreatmentStatus.ACTIVE,
  };

  it('updates photoUrl on PROGRESS_PHOTO events', async () => {
    const event = {
      id: 'e-1',
      treatmentId: 't-1',
      type: TreatmentEventType.PROGRESS_PHOTO,
      title: 'Week 2',
      note: null,
      photoUrl: 'https://old.example/p.jpg',
      occurredAt: new Date(),
      createdByExpertId: null,
      createdAt: new Date(),
    };
    const eventRepo = {
      findOne: jest.fn().mockResolvedValue(event),
      save: jest.fn(async (row) => row),
    };
    const service = buildService({
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatment),
      },
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      eventRepo,
    });

    const result = await service.updateEventPhoto(
      'u-e',
      { isExpert: true, isCustomer: false },
      't-1',
      'e-1',
      'https://placehold.co/400',
    );

    expect(result.photoUrl).toBe('https://placehold.co/400');
    expect(eventRepo.save).toHaveBeenCalled();
  });

  it('rejects photoUrl updates on non-PROGRESS_PHOTO events', async () => {
    const service = buildService({
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatment),
      },
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      },
      eventRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'e-2',
          treatmentId: 't-1',
          type: TreatmentEventType.MILESTONE,
          photoUrl: null,
        }),
      },
    });

    await expect(
      service.updateEventPhoto(
        'u-e',
        { isExpert: true, isCustomer: false },
        't-1',
        'e-2',
        'https://placehold.co/400',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TreatmentsService cross-expert read access', () => {
  const treatmentOwnedByA = {
    id: 't-a',
    expertId: 'expert-a',
    customerId: 'cust-1',
    status: TreatmentStatus.ACTIVE,
    title: 'Plan A',
    description: null,
    clinicId: null,
    startDate: null,
    endDate: null,
    totalPriceVnd: null,
    paidAt: new Date(),
    paidTransactionId: null,
    sourceConsultationId: null,
    cancelledAt: null,
    cancelReason: null,
    cancelledBy: null,
    refundTransactionId: null,
    refundedAmountVnd: null,
    phases: [
      {
        id: 'phase-1',
        phaseType: 'ACTIVE_TREATMENT',
        phaseOrder: 0,
        title: 'Phase 1',
        status: TreatmentPhaseStatus.ACTIVE,
        noteByExpert: 'From Expert A',
        startDate: null,
        endDate: null,
        phaseIngredients: [],
        phaseProducts: [],
        routines: [],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function buildService(deps: {
    treatmentRepo?: Record<string, unknown>;
    eventRepo?: Record<string, unknown>;
    expertRepo?: Record<string, unknown>;
    customerRepo?: Record<string, unknown>;
    consultationRepo?: Record<string, unknown>;
    completionRepo?: Record<string, unknown>;
  }) {
    return new TreatmentsService(
      (deps.treatmentRepo ?? {
        findOne: jest.fn().mockResolvedValue(treatmentOwnedByA),
      }) as never,
      {} as never,
      {} as never,
      {} as never,
      (deps.eventRepo ?? { find: jest.fn().mockResolvedValue([]) }) as never,
      (deps.expertRepo ?? {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-b', userId: 'u-b' }),
      }) as never,
      (deps.customerRepo ?? {}) as never,
      (deps.consultationRepo ?? {
        exists: jest.fn().mockResolvedValue(true),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
      }) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      (deps.completionRepo ?? {
        find: jest.fn().mockResolvedValue([]),
      }) as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('allows Expert B with CONFIRMED booking to getChart for Expert A treatment', async () => {
    const consultationRepo = {
      exists: jest.fn().mockResolvedValue(true),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const service = buildService({ consultationRepo });

    const chart = await service.getChart(
      'u-b',
      { isExpert: true, isCustomer: false },
      't-a',
    );

    expect(chart.treatmentId).toBe('t-a');
    expect(chart.phases[0].noteByExpert).toBe('From Expert A');
    expect(consultationRepo.exists).toHaveBeenCalled();
  });

  it('allows Expert B with accepted booking to getTreatmentForUser and listEvents', async () => {
    const service = buildService({
      consultationRepo: {
        exists: jest.fn().mockResolvedValue(true),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
      },
      eventRepo: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'e-1',
            treatmentId: 't-a',
            type: TreatmentEventType.PROGRESS_PHOTO,
            title: 'Photo',
            note: null,
            photoUrl: 'https://cdn.example/p.jpg',
            occurredAt: new Date(),
            createdByExpertId: 'expert-a',
            createdAt: new Date(),
          },
        ]),
      },
    });

    const detail = await service.getTreatmentForUser('u-b', 't-a', {
      isExpert: true,
      isCustomer: false,
    });
    const events = await service.listEvents(
      'u-b',
      { isExpert: true, isCustomer: false },
      't-a',
    );

    expect(detail.id).toBe('t-a');
    expect(events).toHaveLength(1);
  });

  it('forbids Expert B without accepted booking from viewing chart', async () => {
    const service = buildService({
      consultationRepo: {
        exists: jest.fn().mockResolvedValue(false),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
      },
    });

    await expect(
      service.getChart('u-b', { isExpert: true, isCustomer: false }, 't-a'),
    ).rejects.toThrow(/không có quyền truy cập liệu trình/);
  });

  it('forbids Expert B from creating events on Expert A treatment', async () => {
    const service = buildService({
      consultationRepo: {
        exists: jest.fn().mockResolvedValue(true),
      },
    });

    await expect(
      service.createEvent('u-b', { isExpert: true, isCustomer: false }, 't-a', {
        type: TreatmentEventType.PROGRESS_PHOTO,
        title: 'Hack',
        photoUrl: 'https://cdn.example/x.jpg',
      }),
    ).rejects.toThrow(/không có quyền chỉnh sửa sự kiện/);
  });

  it('forbids Expert B from activating a phase on Expert A treatment', async () => {
    const service = buildService({
      expertRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-b', userId: 'u-b' }),
      },
      treatmentRepo: {
        findOne: jest.fn().mockResolvedValue(treatmentOwnedByA),
      },
    });
    (
      service as unknown as { loadPhase: (id: string) => Promise<unknown> }
    ).loadPhase = async () => ({
      id: 'phase-1',
      treatmentId: 't-a',
      treatment: treatmentOwnedByA,
    });

    await expect(service.activatePhase('u-b', 'phase-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('TreatmentsService listMyTreatments (expert filters)', () => {
  function makeQb(rawIds: Array<{ id: string }>) {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawIds),
    };
    return qb;
  }

  it('searches, sorts asc, and filters by phaseCount', async () => {
    const qb = makeQb([{ id: 't-2' }, { id: 't-1' }]);
    const treatmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue([
        {
          id: 't-1',
          customerId: 'c-1',
          expertId: 'expert-1',
          clinicId: null,
          title: 'Acne plan',
          description: null,
          status: TreatmentStatus.ACTIVE,
          startDate: null,
          endDate: null,
          totalPriceVnd: null,
          submittedAt: null,
          paidAt: null,
          paidTransactionId: null,
          sourceConsultationId: null,
          cancelledAt: null,
          cancelReason: null,
          cancelledBy: null,
          refundTransactionId: null,
          refundedAmountVnd: null,
          phases: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 't-2',
          customerId: 'c-2',
          expertId: 'expert-1',
          clinicId: null,
          title: 'Older acne',
          description: null,
          status: TreatmentStatus.DRAFT,
          startDate: null,
          endDate: null,
          totalPriceVnd: null,
          submittedAt: null,
          paidAt: null,
          paidTransactionId: null,
          sourceConsultationId: null,
          cancelledAt: null,
          cancelReason: null,
          cancelledBy: null,
          refundTransactionId: null,
          refundedAmountVnd: null,
          phases: [],
          createdAt: new Date('2025-12-01'),
          updatedAt: new Date('2025-12-01'),
        },
      ]),
    };
    const service = new TreatmentsService(
      treatmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listMyTreatments('u-e', true, {
      search: 'acne',
      dateOrder: 'asc' as never,
      phaseCount: 2,
    });

    expect(treatmentRepo.createQueryBuilder).toHaveBeenCalledWith('treatment');
    expect(qb.andWhere).toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalledWith('treatment.createdAt', 'ASC');
    expect(result.map((t) => t.id)).toEqual(['t-2', 't-1']);
  });

  it('returns empty list when no treatments match', async () => {
    const qb = makeQb([]);
    const treatmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn(),
    };
    const service = new TreatmentsService(
      treatmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listMyTreatments('u-e', true, {});

    expect(result).toEqual([]);
    expect(treatmentRepo.find).not.toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalledWith('treatment.createdAt', 'DESC');
  });
});

describe('TreatmentsService clinic oversight', () => {
  const buildService = (
    treatmentRepo: Record<string, unknown>,
    escrowService: Record<string, unknown>,
  ) => {
    const service = new TreatmentsService(
      treatmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      escrowService as never,
      {} as never,
      {} as never,
    );
    // Focus these tests on scoping + escrow enrichment, not DTO mapping.
    (
      service as unknown as { toTreatmentDto: (t: { id: string }) => unknown }
    ).toTreatmentDto = (t) => ({ id: t.id, phases: [] });
    return service;
  };

  it('listByClinic scopes by clinicId + submitted and attaches escrow summary', async () => {
    const treatment = { id: 't-1', clinicId: 'clinic-1' };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[treatment], 1]),
    };
    const treatmentRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const escrowService = {
      summarizeByTreatmentIds: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['t-1', { heldVnd: '100000', releasedVnd: '0', refundedVnd: '0' }],
          ]),
        ),
    };
    const service = buildService(treatmentRepo, escrowService);

    const result = await service.listByClinic('clinic-1', {});

    expect(qb.where).toHaveBeenCalledWith('t.clinicId = :clinicId', {
      clinicId: 'clinic-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.submittedAt IS NOT NULL');
    expect(result.total).toBe(1);
    expect(result.items[0].escrow).toEqual({
      heldVnd: '100000',
      releasedVnd: '0',
      refundedVnd: '0',
    });
  });

  it('getByClinic forbids a treatment from another clinic', async () => {
    const treatment = { id: 't-1', clinicId: 'other-clinic', phases: [] };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(treatment),
    };
    const escrowService = {
      summarizeByTreatmentIds: jest.fn().mockResolvedValue(new Map()),
    };
    const service = buildService(treatmentRepo, escrowService);

    await expect(service.getByClinic('clinic-1', 't-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('getByClinic returns a treatment that belongs to the clinic', async () => {
    const treatment = { id: 't-1', clinicId: 'clinic-1', phases: [] };
    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(treatment),
    };
    const escrowService = {
      summarizeByTreatmentIds: jest.fn().mockResolvedValue(new Map()),
    };
    const service = buildService(treatmentRepo, escrowService);

    const result = await service.getByClinic('clinic-1', 't-1');

    expect(result.id).toBe('t-1');
    expect(result.escrow).toEqual({
      heldVnd: '0',
      releasedVnd: '0',
      refundedVnd: '0',
    });
  });
});

describe('TreatmentsService phase product conflict warnings', () => {
  const retinolAhaConflict = {
    protocolId: 'prot-ret',
    conflictingProtocolId: 'prot-aha',
    severity: ConflictSeverity.HIGH,
    reason: 'Retinol kết hợp AHA có thể gây kích ứng quá mức',
    description: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
    protocol: { code: 'retinol_0.3_anti_aging' },
    conflictingProtocol: { code: 'glycolic_exfoliation' },
  };

  const buildService = () => {
    const variantRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'v-ret', productId: 'p-ret' },
        { id: 'v-aha', productId: 'p-aha' },
      ]),
    };
    const productProtocolRepo = {
      find: jest.fn().mockResolvedValue([
        { productId: 'p-ret', protocolId: 'prot-ret' },
        { productId: 'p-aha', protocolId: 'prot-aha' },
      ]),
    };
    const conflictRepo = {
      find: jest.fn().mockResolvedValue([retinolAhaConflict]),
    };
    const service = new TreatmentsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      variantRepo as never,
      {} as never,
      productProtocolRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      conflictRepo as never,
    );
    return { service, conflictRepo };
  };

  it('resolves conflicts among selected phase products', async () => {
    const { service } = buildService();

    const conflicts = await (
      service as unknown as {
        resolvePhaseProductConflicts: (
          ids: string[],
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).resolvePhaseProductConflicts(['v-ret', 'v-aha']);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      protocolCode: 'retinol_0.3_anti_aging',
      conflictingProtocolCode: 'glycolic_exfoliation',
      severity: ConflictSeverity.HIGH,
      description: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
      productVariantIds: ['v-ret'],
      conflictingProductVariantIds: ['v-aha'],
    });
  });

  it('returns no conflicts for a single selected product', async () => {
    const { service, conflictRepo } = buildService();

    const conflicts = await (
      service as unknown as {
        resolvePhaseProductConflicts: (
          ids: string[],
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).resolvePhaseProductConflicts(['v-ret']);

    expect(conflicts).toEqual([]);
    expect(conflictRepo.find).not.toHaveBeenCalled();
  });

  it('warns candidates that conflict with already-selected products', async () => {
    const { service } = buildService();
    const candidates = [
      {
        productVariantId: 'v-aha',
        productId: 'p-aha',
        productName: 'AHA Toner',
        sku: 'AHA-1',
        priceVnd: 200000,
        matchScore: 1,
        matchedIngredientIds: [],
        stockQuantity: 5,
        conflictWarnings: [],
      },
    ];

    await (
      service as unknown as {
        attachConflictWarnings: (
          candidates: Array<Record<string, unknown>>,
          selected: string[],
        ) => Promise<void>;
      }
    ).attachConflictWarnings(candidates, ['v-ret']);

    expect(candidates[0].conflictWarnings).toEqual([
      {
        selectedProductVariantId: 'v-ret',
        protocolCode: 'glycolic_exfoliation',
        conflictingProtocolCode: 'retinol_0.3_anti_aging',
        severity: ConflictSeverity.HIGH,
        description: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
      },
    ]);
  });
});

describe('TreatmentsService generateRoutine defaults', () => {
  const buildService = () => {
    const phase = {
      id: 'phase-1',
      treatmentId: 't-1',
      title: 'Phase 1',
      phaseOrder: 0,
      goals: 'Giảm mụn',
      phaseProducts: [
        { productVariantId: 'v-spf' },
        { productVariantId: 'v-cleanse' },
        { productVariantId: 'v-serum' },
      ],
      treatment: {
        id: 't-1',
        expertId: 'expert-1',
        customerId: 'cust-1',
        status: TreatmentStatus.ACTIVE,
        paidAt: new Date(),
      },
    };

    const savedSteps: Array<Record<string, unknown>> = [];
    const savedDetails: Array<Record<string, unknown>> = [];
    const savedStepProtocols: Array<Record<string, unknown>> = [];

    let sequence = 0;
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          find: jest.fn().mockResolvedValue([]),
          delete: jest.fn().mockResolvedValue(undefined),
          create: jest.fn(
            (_entity: unknown, row: Record<string, unknown>) => row,
          ),
          save: jest.fn((entity: unknown, row: Record<string, unknown>) => {
            const stored = { id: `id-${++sequence}`, ...row };
            if (entity === RoutineStep) savedSteps.push(stored);
            if (entity === RoutineStepDetails) savedDetails.push(stored);
            if (entity === RoutineStepProtocol) savedStepProtocols.push(stored);
            return Promise.resolve(stored);
          }),
          findOneOrFail: jest.fn().mockResolvedValue({ id: 'routine-1' }),
        };
        return cb(manager);
      }),
    };

    const variantRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'v-spf',
          productId: 'p-spf',
          sku: 'SKU-SPF',
          product: {
            name: 'Anthelios SPF50+',
            category: { code: 'SUNSCREEN' },
          },
        },
        {
          id: 'v-cleanse',
          productId: 'p-cleanse',
          sku: 'SKU-C',
          product: { name: 'Gentle Cleanser', category: { code: 'CLEANSER' } },
        },
        {
          id: 'v-serum',
          productId: 'p-serum',
          sku: 'SKU-S',
          product: { name: 'Niacinamide Serum', category: { code: 'SERUM' } },
        },
      ]),
    };

    const productProtocolRepo = {
      find: jest.fn().mockResolvedValue([
        {
          productId: 'p-spf',
          protocolId: 'prot-spf',
          protocol: {
            id: 'prot-spf',
            code: 'sunscreen_daily_spf',
            name: 'Chống nắng hằng ngày',
            timeOfUse: TimeOfUse.AM,
            instructions: 'Thoa lại sau 2 giờ ngoài trời.',
          },
        },
        {
          productId: 'p-cleanse',
          protocolId: 'prot-cleanse',
          protocol: {
            id: 'prot-cleanse',
            code: 'cleanser_gentle_foam',
            name: 'Sữa rửa mặt dịu nhẹ',
            timeOfUse: TimeOfUse.AM_PM,
            instructions: null,
          },
        },
        {
          productId: 'p-serum',
          protocolId: 'prot-serum',
          protocol: {
            id: 'prot-serum',
            code: 'serum_niacinamide',
            name: 'Serum Niacinamide',
            timeOfUse: TimeOfUse.AM,
            instructions: null,
          },
        },
      ]),
    };

    const service = new TreatmentsService(
      { findOne: jest.fn().mockResolvedValue(phase.treatment) } as never,
      { findOne: jest.fn().mockResolvedValue(phase) } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      variantRepo as never,
      {} as never,
      productProtocolRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
    );

    return { service, savedSteps, savedDetails, savedStepProtocols };
  };

  it('orders steps by category rank and fills dosage/wait defaults', async () => {
    const { service, savedSteps, savedDetails, savedStepProtocols } =
      buildService();

    await service.generateRoutine('u-e', 'phase-1');

    const morning = savedSteps
      .filter((s) => s.period === RoutinePeriod.MORNING)
      .sort((a, b) => (a.stepOrder as number) - (b.stepOrder as number));

    expect(morning.map((s) => s.stepOrder)).toEqual([0, 1, 2]);
    expect(morning.map((s) => s.name)).toEqual([
      'Sữa rửa mặt dịu nhẹ',
      'Serum Niacinamide',
      'Chống nắng hằng ngày',
    ]);
    expect(morning.map((s) => s.dosageText)).toEqual([
      'bằng hạt đậu',
      '2-3 giọt',
      'hai đốt ngón tay',
    ]);
    // First step of a period never waits; the serum waits before sunscreen.
    expect(morning.map((s) => s.waitMinutes)).toEqual([0, 5, 0]);

    const evening = savedSteps.filter(
      (s) => s.period === RoutinePeriod.EVENING,
    );
    expect(evening).toHaveLength(1);
    expect(evening[0]).toMatchObject({ stepOrder: 0, waitMinutes: 0 });

    expect(savedDetails.map((d) => d.amountMl)).toEqual([2, 2, 2, 2]);
    expect(savedStepProtocols.map((p) => p.amountMl)).toEqual([2, 2, 2, 2]);
  });
});

describe('TreatmentsService updateRoutine dosage edits', () => {
  const buildService = (steps: Array<Record<string, unknown>>) => {
    const routine = {
      id: 'routine-1',
      type: RoutineType.EXPERT_PRESCRIBED,
      status: RoutineStatus.ACTIVE,
      treatmentPhaseId: 'phase-1',
      treatmentPhase: { treatmentId: 't-1' },
      steps,
    };

    const routineRepo = {
      findOne: jest.fn().mockResolvedValue(routine),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      findOneOrFail: jest.fn().mockResolvedValue(routine),
    };
    const stepRepo = {
      find: jest.fn().mockResolvedValue(steps),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      create: jest.fn((row: Record<string, unknown>) => row),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const stepDetailsRepo = { update: jest.fn().mockResolvedValue(undefined) };

    const service = new TreatmentsService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 't-1', expertId: 'expert-1' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'expert-1', userId: 'u-e' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      routineRepo as never,
      stepRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      stepDetailsRepo as never,
    );

    return { service, stepRepo, stepDetailsRepo };
  };

  it('persists an edited amountMl and keeps untouched defaults', async () => {
    const step = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Serum Niacinamide',
      period: RoutinePeriod.MORNING,
      stepOrder: 1,
      instructions: null,
      waitMinutes: 5,
      dosageText: '2-3 giọt',
    };
    const { service, stepRepo, stepDetailsRepo } = buildService([step]);

    await service.updateRoutine('u-e', 'routine-1', {
      steps: [{ id: step.id, amountMl: 1.5 }],
    });

    expect(stepDetailsRepo.update).toHaveBeenCalledWith(
      { routineStepId: step.id },
      { amountMl: 1.5 },
    );
    expect(stepRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ waitMinutes: 5, dosageText: '2-3 giọt' }),
    );
  });

  it('defaults dosage and wait time for manually added steps', async () => {
    const { service, stepRepo } = buildService([]);

    await service.updateRoutine('u-e', 'routine-1', {
      steps: [
        { name: 'Sữa rửa mặt dịu nhẹ', period: 'MORNING' },
        { name: 'Serum Niacinamide', period: 'MORNING' },
      ],
    });

    expect(stepRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dosageText: 'bằng hạt đậu', waitMinutes: 0 }),
    );
    expect(stepRepo.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ dosageText: '2-3 giọt', waitMinutes: 5 }),
    );
  });
});
