import { DataSource } from 'typeorm';
import { AdminClinicBalancesService } from './admin-clinic-balances.service';

describe('AdminClinicBalancesService', () => {
  function makeService(
    countRows: Array<Record<string, unknown>>,
    itemRows: Array<Record<string, unknown>>,
  ) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(countRows)
      .mockResolvedValueOnce(itemRows);
    const service = new AdminClinicBalancesService({
      query,
    } as unknown as DataSource);
    return { service, query };
  }

  it('maps per-clinic sums as strings and defaults missing sums to 0', async () => {
    const { service } = makeService(
      [{ total: '2' }],
      [
        {
          clinic_id: 'clinic-1',
          clinic_name: 'Phòng khám Quận 1',
          balance_vnd: '12500000',
          held_escrow_vnd: '3200000',
          pending_withdrawals_vnd: '5000000',
          commission_earned_vnd: '1450000',
          last_payout_at: '2026-08-10T04:00:00.000Z',
        },
        {
          clinic_id: 'clinic-2',
          clinic_name: 'Phòng khám mới',
          balance_vnd: null,
          held_escrow_vnd: null,
          pending_withdrawals_vnd: null,
          commission_earned_vnd: null,
          last_payout_at: null,
        },
      ],
    );

    const result = await service.list({});

    expect(result.total).toBe(2);
    expect(result.items[0]).toEqual({
      clinicId: 'clinic-1',
      clinicName: 'Phòng khám Quận 1',
      balanceVnd: '12500000',
      heldEscrowVnd: '3200000',
      pendingWithdrawalsVnd: '5000000',
      commissionEarnedVnd: '1450000',
      lastPayoutAt: new Date('2026-08-10T04:00:00.000Z'),
    });
    expect(result.items[1]).toMatchObject({
      balanceVnd: '0',
      heldEscrowVnd: '0',
      pendingWithdrawalsVnd: '0',
      commissionEarnedVnd: '0',
      lastPayoutAt: null,
    });
  });

  it('filters by clinicId and name search with pagination params', async () => {
    const { service, query } = makeService([{ total: '1' }], []);

    await service.list({
      clinicId: 'clinic-1',
      search: 'Quận',
      page: 2,
      limit: 10,
    });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('c.id = $1');
    expect(countSql).toContain('c.name ILIKE $2');
    expect(countParams).toEqual(['clinic-1', '%Quận%']);

    const [itemsSql, itemParams] = query.mock.calls[1] as [string, unknown[]];
    expect(itemsSql).toContain('LIMIT $3 OFFSET $4');
    expect(itemParams).toEqual(['clinic-1', '%Quận%', 10, 10]);
  });

  it('aggregates only HELD escrow, REQUESTED withdrawals and completed platform commission', async () => {
    const { service, query } = makeService([{ total: '0' }], []);

    await service.list({});

    const [itemsSql] = query.mock.calls[1] as [string];
    expect(itemsSql).toContain("h.status = 'HELD'");
    expect(itemsSql).toContain("cw.status = 'REQUESTED'");
    expect(itemsSql).toContain("t.type = 'COMMISSION'");
    expect(itemsSql).toContain('t."toAccount" = \'PLATFORM_REVENUE\'');
    expect(itemsSql).toContain("cw.status = 'PAID'");
  });
});
