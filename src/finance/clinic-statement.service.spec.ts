import { ClinicStatementService } from './clinic-statement.service';
import { TransactionType } from '../commerce/enums';

describe('ClinicStatementService.exportTransactionsCsv', () => {
  function makeService(rows: Array<Record<string, unknown>>) {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const service = new ClinicStatementService(
      transactionRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, qb };
  }

  const row = {
    createdAt: new Date('2026-08-13T07:00:00.000Z'),
    type: TransactionType.ESCROW_RELEASE,
    status: 'COMPLETED',
    amountVnd: '270000',
    fromAccount: 'PLATFORM_ESCROW',
    toAccount: 'CLINIC_WALLET',
    expertId: 'expert-1',
    consultationId: 'c-1',
    treatmentId: null,
    treatmentPhaseId: null,
    withdrawalId: null,
    externalRef: 'escrow-release:hold-1',
    note: 'Phase 1 released',
  };

  it('scopes by clinicId and emits a header + one row per transaction', async () => {
    const { service, qb } = makeService([row]);

    const csv = await service.exportTransactionsCsv('clinic-1', {});

    expect(qb.where).toHaveBeenCalledWith('t.clinicId = :clinicId', {
      clinicId: 'clinic-1',
    });
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Date,Type,Status,Amount (VND)');
    expect(lines[1]).toContain('270000');
    expect(lines[1]).toContain('escrow-release:hold-1');
  });

  it('applies optional type/expertId/from/to filters', async () => {
    const { service, qb } = makeService([]);

    await service.exportTransactionsCsv('clinic-1', {
      type: TransactionType.WITHDRAWAL,
      expertId: 'expert-9',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('t.type = :type', {
      type: TransactionType.WITHDRAWAL,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.expertId = :expertId', {
      expertId: 'expert-9',
    });
  });

  it('escapes fields containing commas or quotes', async () => {
    const { service } = makeService([
      { ...row, note: 'Refund, partial "phase 2"' },
    ]);

    const csv = await service.exportTransactionsCsv('clinic-1', {});

    expect(csv).toContain('"Refund, partial ""phase 2"""');
  });
});
