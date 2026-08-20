import { BadRequestException } from '@nestjs/common';
import { EscrowService } from './escrow.service';

describe('EscrowService.splitCommission', () => {
  it('floors commission so remainder stays with platform', () => {
    expect(EscrowService.splitCommission(1000, 10)).toEqual({
      commissionVnd: 100,
      netVnd: 900,
    });
    expect(EscrowService.splitCommission(1, 10)).toEqual({
      commissionVnd: 0,
      netVnd: 1,
    });
    expect(EscrowService.splitCommission(333, 10)).toEqual({
      commissionVnd: 33,
      netVnd: 300,
    });
  });

  it('supports 0% and 100% commission', () => {
    expect(EscrowService.splitCommission(500000, 0)).toEqual({
      commissionVnd: 0,
      netVnd: 500000,
    });
    expect(EscrowService.splitCommission(500000, 100)).toEqual({
      commissionVnd: 500000,
      netVnd: 0,
    });
  });

  it('rejects invalid amounts and rates', () => {
    expect(() => EscrowService.splitCommission(0, 10)).toThrow(
      BadRequestException,
    );
    expect(() => EscrowService.splitCommission(100, -1)).toThrow(
      BadRequestException,
    );
    expect(() => EscrowService.splitCommission(100, 101)).toThrow(
      BadRequestException,
    );
  });
});

describe('EscrowService release vs refund exclusivity', () => {
  function makeEscrowService(holdStatus: string) {
    const hold = {
      id: 'hold-1',
      status: holdStatus,
      amountVnd: '300000',
      commissionRatePct: '10',
      clinicId: 'clinic-1',
      expertId: 'expert-1',
      customerUserId: 'user-1',
      consultationId: 'c-1',
      treatmentId: null,
      treatmentPhaseId: null,
    };

    const ledgerService = {
      writeWithManager: jest.fn().mockResolvedValue({ id: 'tx-ledger' }),
    };
    const clinicWalletService = {
      creditWithManager: jest.fn().mockResolvedValue({ balanceVnd: '270000' }),
    };
    const walletService = {
      creditWithManager: jest.fn().mockResolvedValue({ id: 'tx-refund' }),
    };
    const escrowHoldRepo = {};
    const clinicRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'clinic-1',
        commissionRatePct: '10',
      }),
    };

    const service = new EscrowService(
      escrowHoldRepo as never,
      clinicRepo as never,
      ledgerService,
      clinicWalletService as never,
      walletService as never,
    );

    (
      service as unknown as {
        lockHold: () => Promise<typeof hold>;
      }
    ).lockHold = async () => hold;

    return { service, hold, ledgerService, clinicWalletService, walletService };
  }

  it('releases HELD escrow into clinic net + commission', async () => {
    const { service, hold, clinicWalletService, ledgerService } =
      makeEscrowService('HELD');
    const manager = {
      save: jest.fn(async (_e: unknown, row: unknown) => row),
    };

    const result = await service.releaseWithManager(manager as never, hold.id);

    expect(clinicWalletService.creditWithManager).toHaveBeenCalledWith(
      manager,
      'clinic-1',
      270000,
    );
    expect(ledgerService.writeWithManager).toHaveBeenCalledTimes(2);
    expect(result?.status).toBe('RELEASED');
    expect(result?.netVnd).toBe('270000');
    expect(result?.commissionVnd).toBe('30000');
  });

  it('rejects release when already REFUNDED', async () => {
    const { service, hold } = makeEscrowService('REFUNDED');
    await expect(
      service.releaseWithManager({} as never, hold.id),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects refund when already RELEASED', async () => {
    const { service, hold } = makeEscrowService('RELEASED');
    await expect(
      service.refundWithManager({} as never, hold.id),
    ).rejects.toThrow(BadRequestException);
  });

  it('refunds HELD escrow to customer wallet', async () => {
    const { service, hold, walletService } = makeEscrowService('HELD');
    const manager = {
      save: jest.fn(async (_e: unknown, row: unknown) => row),
    };

    const result = await service.refundWithManager(manager as never, hold.id);

    expect(walletService.creditWithManager).toHaveBeenCalled();
    expect(result?.status).toBe('REFUNDED');
  });
});

describe('EscrowService clinic commission snapshot', () => {
  it('snapshots the selected clinic rate when creating a hold', async () => {
    const clinicRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'clinic-2',
        commissionRatePct: '12.5',
      }),
    };
    const service = new EscrowService(
      {} as never,
      clinicRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, input) => input),
      save: jest.fn(async (_entity, input) => input),
    };

    const hold = await service.holdConsultationWithManager(manager as never, {
      consultationId: 'consultation-1',
      clinicId: 'clinic-2',
      expertId: 'expert-1',
      customerUserId: 'customer-1',
      amountVnd: 400000,
      holdTransactionId: 'transaction-1',
    });

    expect(hold.commissionRatePct).toBe('12.5');
    expect(clinicRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'clinic-2' },
      select: { id: true, commissionRatePct: true },
    });
  });

  it('snapshots the clinic rate for treatment phase holds', async () => {
    const clinicRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'clinic-3',
        commissionRatePct: '8.75',
      }),
    };
    const service = new EscrowService(
      {} as never,
      clinicRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, input) => input),
      save: jest.fn(async (_entity, input) => input),
    };

    const hold = await service.holdTreatmentPhaseWithManager(manager as never, {
      treatmentId: 'treatment-1',
      treatmentPhaseId: 'phase-1',
      clinicId: 'clinic-3',
      expertId: 'expert-1',
      customerUserId: 'customer-1',
      amountVnd: 500000,
      holdTransactionId: 'transaction-1',
    });

    expect(hold.commissionRatePct).toBe('8.75');
  });

  it('returns an existing snapshot without reading the current clinic rate', async () => {
    const existing = {
      id: 'hold-1',
      commissionRatePct: '7.5',
    };
    const clinicRepo = { findOne: jest.fn() };
    const service = new EscrowService(
      {} as never,
      clinicRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const manager = { findOne: jest.fn().mockResolvedValue(existing) };

    const hold = await service.holdConsultationWithManager(manager as never, {
      consultationId: 'consultation-1',
      clinicId: 'clinic-2',
      expertId: 'expert-1',
      customerUserId: 'customer-1',
      amountVnd: 400000,
      holdTransactionId: 'transaction-1',
    });

    expect(hold).toBe(existing);
    expect(clinicRepo.findOne).not.toHaveBeenCalled();
  });
});
