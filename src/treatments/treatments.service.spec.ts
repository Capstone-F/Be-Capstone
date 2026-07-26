import { BadRequestException } from '@nestjs/common';
import { TreatmentPhaseStatus, TreatmentStatus } from './enums';
import { TreatmentsService } from './treatments.service';

describe('TreatmentsService phase activation rules', () => {
  function makeService(overrides: {
    phase?: Record<string, unknown>;
    routines?: Array<Record<string, unknown>>;
    activeOthers?: Array<Record<string, unknown>>;
  }) {
    const phase = {
      id: 'phase-1',
      treatmentId: 't-1',
      status: TreatmentPhaseStatus.PENDING,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-09-01'),
      notes: null,
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

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          find: jest.fn().mockResolvedValue(overrides.activeOthers ?? []),
          save: jest.fn((_e, row) => Promise.resolve(row)),
        };
        return cb(manager);
      }),
    };

    const service = new TreatmentsService(
      treatmentRepo as never,
      phaseRepo as never,
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
      dataSource as never,
    );

    // Bypass private loaders by spying through public activate after patching private methods via any
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

    return { service, dataSource, phase };
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
});
