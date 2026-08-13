import { BadRequestException } from '@nestjs/common';
import { ClinicWithdrawalsService } from './clinic-withdrawals.service';
import { ClinicWithdrawalStatus } from './enums';

describe('ClinicWithdrawalsService', () => {
  function makeService(clinicOverrides: Record<string, unknown> = {}) {
    const clinic = {
      id: 'clinic-1',
      bankName: 'Vietcombank',
      bankAccountNumber: '0123456789',
      bankAccountHolder: 'GlowScan Clinic',
      ...clinicOverrides,
    };

    const withdrawalRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const clinicRepo = {
      findOne: jest.fn().mockResolvedValue(clinic),
    };
    const clinicWalletService = {
      debitWithManager: jest.fn().mockResolvedValue({ balanceVnd: '0' }),
      creditWithManager: jest.fn().mockResolvedValue({ balanceVnd: '500000' }),
    };
    const ledgerService = {
      writeWithManager: jest.fn().mockResolvedValue({ id: 'tx-wd' }),
    };

    let savedWithdrawal: Record<string, unknown> | null = null;

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          create: jest.fn(
            (_entity: unknown, data: Record<string, unknown>) => ({
              id: 'wd-1',
              ...data,
            }),
          ),
          save: jest.fn(
            async (_entity: unknown, row: Record<string, unknown>) => {
              savedWithdrawal = { ...row };
              return row;
            },
          ),
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(
                savedWithdrawal ?? {
                  id: 'wd-1',
                  clinicId: 'clinic-1',
                  amountVnd: '500000',
                  status: ClinicWithdrawalStatus.REQUESTED,
                  bankName: clinic.bankName,
                  bankAccountNumber: clinic.bankAccountNumber,
                  bankAccountHolder: clinic.bankAccountHolder,
                },
              ),
            }),
          }),
        };
        return cb(manager);
      }),
    };

    const service = new ClinicWithdrawalsService(
      withdrawalRepo as never,
      clinicRepo as never,
      clinicWalletService as never,
      ledgerService,
      dataSource as never,
    );

    return {
      service,
      clinicRepo,
      clinicWalletService,
      ledgerService,
      dataSource,
    };
  }

  it('rejects withdrawal when bank account is unset', async () => {
    const { service } = makeService({
      bankName: null,
      bankAccountNumber: null,
      bankAccountHolder: null,
    });

    await expect(
      service.requestWithdrawal('clinic-1', 'manager-1', 100000),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-positive withdrawal amounts', async () => {
    const { service } = makeService();
    await expect(
      service.requestWithdrawal('clinic-1', 'manager-1', 0),
    ).rejects.toThrow(BadRequestException);
  });

  it('requests withdrawal by debiting clinic wallet and writing ledger', async () => {
    const { service, clinicWalletService, ledgerService } = makeService();

    const result = await service.requestWithdrawal(
      'clinic-1',
      'manager-1',
      500000,
    );

    expect(clinicWalletService.debitWithManager).toHaveBeenCalled();
    expect(ledgerService.writeWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amountVnd: 500000,
        externalRef: 'clinic-withdrawal:wd-1',
      }),
    );
    expect(result.status).toBe(ClinicWithdrawalStatus.REQUESTED);
    expect(result.amountVnd).toBe('500000');
  });

  it('re-credits clinic wallet when admin rejects a withdrawal', async () => {
    const { service, clinicWalletService, ledgerService } = makeService();

    await service.requestWithdrawal('clinic-1', 'manager-1', 500000);
    const rejected = await service.reject(
      'wd-1',
      'staff-1',
      'Bad bank details',
    );

    expect(clinicWalletService.creditWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'clinic-1',
      '500000',
    );
    expect(ledgerService.writeWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalRef: 'clinic-withdrawal-reversal:wd-1',
      }),
    );
    expect(rejected.status).toBe(ClinicWithdrawalStatus.REJECTED);
  });
});
