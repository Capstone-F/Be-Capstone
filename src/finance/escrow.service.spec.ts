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
    const settingRepo = {
      findOneBy: jest.fn().mockResolvedValue({ value: '10' }),
    };

    const service = new EscrowService(
      escrowHoldRepo as never,
      settingRepo as never,
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
