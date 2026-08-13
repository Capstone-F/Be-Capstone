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
      platformCommissionRevenueVnd: 30000,
    });
    expect(result.funnel.steps.at(-1)).toMatchObject({
      sessions: 2,
      conversionFromPreviousPct: 50,
      overallConversionPct: 20,
    });
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((point) => point.newCustomers === 0)).toBe(true);
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
