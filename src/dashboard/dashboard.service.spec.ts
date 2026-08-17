import { DataSource } from 'typeorm';
import {
  dashboardDateKeys,
  DashboardService,
  resolveDashboardPeriod,
} from './dashboard.service';
import { DashboardRange } from './dto/dashboard-query.dto';

describe('dashboard period helpers', () => {
  it('defaults to an inclusive thirty-day range', () => {
    const period = resolveDashboardPeriod(
      undefined,
      new Date('2026-08-13T12:00:00.000Z'),
    );

    expect(period.range).toBe(DashboardRange.THIRTY_DAYS);
    expect(period.from).toBe('2026-07-15');
    expect(dashboardDateKeys(period)).toHaveLength(30);
  });

  it('uses Vietnam calendar days and returns an inclusive seven-day range', () => {
    const period = resolveDashboardPeriod(
      DashboardRange.SEVEN_DAYS,
      new Date('2026-08-13T00:30:00.000Z'),
    );

    expect(period).toEqual({
      range: DashboardRange.SEVEN_DAYS,
      from: '2026-08-07',
      to: '2026-08-13',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(dashboardDateKeys(period)).toHaveLength(7);
  });

  it('fills every day in a ninety-day period', () => {
    const period = resolveDashboardPeriod(
      DashboardRange.NINETY_DAYS,
      new Date('2026-08-13T12:00:00.000Z'),
    );
    const keys = dashboardDateKeys(period);

    expect(keys).toHaveLength(90);
    expect(keys.at(-1)).toBe('2026-08-13');
  });
});

describe('DashboardService aggregation mapping', () => {
  it('maps authoritative ecommerce finance values and fills missing trend days', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          active_customers: '12',
          active_experts: '3',
          active_clinics: '2',
          paid_orders: '4',
          gross_product_sales: '900000',
          discounts: '50000',
          shipping_collected: '80000',
          product_payments_collected: '930000',
          product_refunds: '120000',
          average_order_value: '232500',
          consultation_fees_collected: '300000',
          consultation_refunds: '50000',
          treatment_payments_collected: '1500000',
          treatment_refunds: '250000',
          platform_commission_revenue: '30000',
        },
      ])
      .mockResolvedValueOnce([
        {
          submitted_stock_forms: '1',
          open_cancellations: '2',
          failed_workflows: '0',
          experts_missing_profile: '1',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          viewed_sessions: '10',
          added_sessions: '5',
          checkout_sessions: '4',
          purchased_sessions: '2',
        },
      ])
      .mockResolvedValueOnce([{ available_from: '2026-08-10' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new DashboardService({ query } as unknown as DataSource);

    const result = await service.getAdminDashboard(DashboardRange.SEVEN_DAYS);

    expect(result.metrics).toMatchObject({
      productPaymentsCollectedVnd: 930000,
      productRefundsVnd: 120000,
      averageOrderValueVnd: 232500,
      treatmentPaymentsCollectedVnd: 1500000,
      treatmentRefundsVnd: 250000,
      platformCommissionRevenueVnd: 30000,
    });
    expect(result.funnel.steps.at(-1)).toMatchObject({
      sessions: 2,
      conversionFromPreviousPct: 50,
      overallConversionPct: 20,
    });
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((point) => point.newCustomers === 0)).toBe(true);
    expect(
      result.trend.every(
        (point) =>
          point.treatmentPaymentsCollectedVnd === 0 &&
          point.treatmentRefundsVnd === 0,
      ),
    ).toBe(true);
  });

  it('paginates the admin activity log with server-side filters', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: '843' }])
      .mockResolvedValueOnce([
        {
          id: 'wd-1',
          type: 'WITHDRAWAL_PAID',
          title: 'Duyệt rút tiền phòng khám',
          description: 'Phòng khám Quận 1',
          amount_vnd: '5000000',
          actor_id: 'admin-1',
          actor_name: 'Admin Trung',
          entity_id: 'wd-1',
          occurred_at: '2026-08-16T03:12:44.000Z',
        },
      ]);
    const service = new DashboardService({ query } as unknown as DataSource);

    const result = await service.getAdminActivity({
      type: ['WITHDRAWAL_PAID', 'REFUND'],
      actorId: 'admin-1',
      from: '2026-08-01',
      to: '2026-08-16',
      page: 2,
      limit: 50,
    });

    expect(result.total).toBe(843);
    expect(result.page).toBe(2);
    expect(result.items[0]).toEqual({
      id: 'wd-1',
      type: 'WITHDRAWAL_PAID',
      title: 'Duyệt rút tiền phòng khám',
      description: 'Phòng khám Quận 1',
      amountVnd: 5000000,
      actorId: 'admin-1',
      actorName: 'Admin Trung',
      entityId: 'wd-1',
      occurredAt: new Date('2026-08-16T03:12:44.000Z'),
    });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('activity.type = ANY($1::text[])');
    expect(countSql).toContain('activity.actor_id = $2');
    expect(countParams).toEqual([
      ['WITHDRAWAL_PAID', 'REFUND'],
      'admin-1',
      '2026-08-01',
      '2026-08-16',
    ]);

    const [itemsSql, itemParams] = query.mock.calls[1] as [string, unknown[]];
    expect(itemsSql).toContain('ORDER BY activity.occurred_at DESC');
    expect(itemsSql).toContain('LIMIT $5 OFFSET $6');
    expect(itemParams).toEqual([
      ['WITHDRAWAL_PAID', 'REFUND'],
      'admin-1',
      '2026-08-01',
      '2026-08-16',
      50,
      50,
    ]);
  });

  it('returns unfiltered activity with defaults when no filters are given', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: '3' }])
      .mockResolvedValueOnce([]);
    const service = new DashboardService({ query } as unknown as DataSource);

    const result = await service.getAdminActivity({});

    expect(result).toMatchObject({ total: 3, page: 1, limit: 20, items: [] });
    const [countSql] = query.mock.calls[0] as [string];
    expect(countSql).not.toContain('WHERE activity');
    const [, itemParams] = query.mock.calls[1] as [string, unknown[]];
    expect(itemParams).toEqual([20, 0]);
  });

  it('maps staff queues and personal active support independently', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          open_support: '7',
          my_active_support: '2',
          submitted_stock: '3',
          ready_returns: '1',
          failed_workflows: '1',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'support-1',
          customer_name: 'An',
          subject: 'Đơn hàng',
          waiting_since: '2026-08-13T01:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new DashboardService({ query } as unknown as DataSource);

    const result = await service.getStaffDashboard(
      'staff-user',
      DashboardRange.SEVEN_DAYS,
    );

    expect(result.metrics).toMatchObject({
      unassignedOpenSupport: 7,
      myActiveSupport: 2,
    });
    expect(result.queues.openSupportSessions[0].customerName).toBe('An');
    expect(query.mock.calls[0][1]).toEqual(['staff-user']);
  });
});
