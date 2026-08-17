import {
  AdminTransactionsService,
  vnDayStart,
  vnDayEnd,
} from './admin-transactions.service';
import { TransactionStatus, TransactionType } from '../commerce/enums';

describe('vn day boundaries', () => {
  it('interprets YYYY-MM-DD as Asia/Ho_Chi_Minh calendar days', () => {
    expect(vnDayStart('2026-08-16').toISOString()).toBe(
      '2026-08-15T17:00:00.000Z',
    );
    expect(vnDayEnd('2026-08-16').toISOString()).toBe(
      '2026-08-16T16:59:59.999Z',
    );
  });
});

describe('AdminTransactionsService', () => {
  function makeService(rows: Array<Record<string, unknown>>, total = 0) {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const service = new AdminTransactionsService(transactionRepo as never);
    return { service, qb };
  }

  const row = {
    id: 'tx-1',
    type: TransactionType.COMMISSION,
    status: TransactionStatus.COMPLETED,
    amountVnd: '45000',
    fromAccount: 'PLATFORM_ESCROW',
    toAccount: 'PLATFORM_REVENUE',
    clinicId: 'clinic-1',
    clinic: { id: 'clinic-1', name: 'Phòng khám Quận 1' },
    userId: 'user-1',
    user: { id: 'user-1', name: null, email: 'a@example.com' },
    orderId: null,
    consultationId: 'consult-1',
    treatmentId: null,
    treatmentPhaseId: null,
    escrowHoldId: 'hold-1',
    withdrawalId: null,
    expertId: 'expert-1',
    externalRef: 'escrow-commission:hold-1',
    note: null,
    createdAt: new Date('2026-08-16T03:12:44.000Z'),
  };

  it('lists without any scoping when no filters are given', async () => {
    const { service, qb } = makeService([row], 1);

    const result = await service.list({});

    expect(qb.andWhere).not.toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('t.clinic', 'clinic');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('t.user', 'user');
    expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('joins clinic and user names into the DTO (email fallback)', async () => {
    const { service } = makeService([row], 1);

    const result = await service.list({});

    expect(result.items[0]).toMatchObject({
      id: 'tx-1',
      amountVnd: '45000',
      clinicName: 'Phòng khám Quận 1',
      userName: 'a@example.com',
    });
  });

  it('applies partner, amount and VN-timezone date filters', async () => {
    const { service, qb } = makeService([], 0);

    await service.list({
      type: TransactionType.COMMISSION,
      status: TransactionStatus.COMPLETED,
      clinicId: 'clinic-1',
      userId: 'user-1',
      expertId: 'expert-1',
      orderId: 'order-1',
      from: '2026-08-01',
      to: '2026-08-16',
      minAmountVnd: 1000,
      maxAmountVnd: 500000,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('t.clinicId = :clinicId', {
      clinicId: 'clinic-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.userId = :userId', {
      userId: 'user-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.orderId = :orderId', {
      orderId: 'order-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.createdAt >= :from', {
      from: new Date('2026-07-31T17:00:00.000Z'),
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.createdAt <= :to', {
      to: new Date('2026-08-16T16:59:59.999Z'),
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.amountVnd >= :minAmountVnd', {
      minAmountVnd: 1000,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.amountVnd <= :maxAmountVnd', {
      maxAmountVnd: 500000,
    });
  });

  it('clamps pagination to at most 100 rows per page', async () => {
    const { service, qb } = makeService([], 0);

    await service.list({ page: 3, limit: 100 });

    expect(qb.skip).toHaveBeenCalledWith(200);
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('exports CSV with joined names, oldest first', async () => {
    const { service, qb } = makeService([row]);

    const csv = await service.exportCsv({});

    expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'ASC');
    expect(qb.take).toHaveBeenCalledWith(10000);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Clinic Name');
    expect(lines[0]).toContain('User Name');
    expect(lines[1]).toContain('Phòng khám Quận 1');
    expect(lines[1]).toContain('45000');
  });
});
