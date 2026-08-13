import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardRange } from './dto/dashboard-query.dto';
import {
  AdminDashboardResponseDto,
  DashboardActivityDto,
  DashboardPeriodDto,
  ExpertBookingQueueItemDto,
  ExpertDashboardResponseDto,
  StaffDashboardResponseDto,
} from './dto/dashboard-response.dto';

const DASHBOARD_TIMEZONE = 'Asia/Ho_Chi_Minh';
const RANGE_DAYS: Record<DashboardRange, number> = {
  [DashboardRange.SEVEN_DAYS]: 7,
  [DashboardRange.THIRTY_DAYS]: 30,
  [DashboardRange.NINETY_DAYS]: 90,
};

type CountRow = Record<string, string | number | boolean | null>;

export function resolveDashboardPeriod(
  range = DashboardRange.THIRTY_DAYS,
  now = new Date(),
): DashboardPeriodDto {
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  toDate.setUTCDate(toDate.getUTCDate() - (RANGE_DAYS[range] - 1));

  return {
    range,
    from: toDate.toISOString().slice(0, 10),
    to,
    timezone: DASHBOARD_TIMEZONE,
  };
}

export function dashboardDateKeys(period: DashboardPeriodDto): string[] {
  const cursor = new Date(`${period.from}T00:00:00.000Z`);
  const end = new Date(`${period.to}T00:00:00.000Z`);
  const keys: string[] = [];
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getAdminDashboard(
    range = DashboardRange.THIRTY_DAYS,
  ): Promise<AdminDashboardResponseDto> {
    const period = resolveDashboardPeriod(range);
    const [
      metricsRows,
      attentionRows,
      trendRows,
      funnelRows,
      availabilityRows,
      topProductRows,
      activityRows,
    ] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `
        WITH paid_order_payments AS (
          SELECT DISTINCT ON (p."orderId") p."orderId", p."amountVnd", p."paidAt"
          FROM payments p
          WHERE p.purpose = 'ORDER' AND p.status = 'PAID'
            AND p."orderId" IS NOT NULL AND p."paidAt" IS NOT NULL
            AND (p."paidAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          ORDER BY p."orderId", p."paidAt" DESC
        )
        SELECT
          (SELECT COUNT(*) FROM users u
            WHERE u."isActive" = true
            AND string_to_array(COALESCE(u.roles, ''), ',') @> ARRAY['customer']) AS active_customers,
          (SELECT COUNT(*) FROM experts e WHERE e."isActive" = true) AS active_experts,
          (SELECT COUNT(*) FROM clinics c WHERE c."isActive" = true) AS active_clinics,
          COUNT(pop."orderId") AS paid_orders,
          COALESCE(SUM(o."subtotalVnd"), 0) AS gross_product_sales,
          COALESCE(SUM(o."discountVnd"), 0) AS discounts,
          COALESCE(SUM(o."shippingFeeVnd"), 0) AS shipping_collected,
          COALESCE(SUM(pop."amountVnd"::numeric), 0) AS product_payments_collected,
          COALESCE((SELECT SUM(t."amountVnd"::numeric) FROM transactions t
            WHERE t.type = 'REFUND' AND t.status = 'COMPLETED' AND t."orderId" IS NOT NULL
              AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date), 0) AS product_refunds,
          CASE WHEN COUNT(pop."orderId") = 0 THEN 0
            ELSE ROUND(SUM(pop."amountVnd"::numeric) / COUNT(pop."orderId")) END AS average_order_value,
          COALESCE((SELECT SUM(t."amountVnd"::numeric) FROM transactions t
            WHERE t.type = 'CONSULTATION_PAYMENT' AND t.status = 'COMPLETED'
              AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date), 0) AS consultation_fees_collected,
          COALESCE((SELECT SUM(t."amountVnd"::numeric) FROM transactions t
            WHERE t.type = 'REFUND' AND t.status = 'COMPLETED' AND t."consultationId" IS NOT NULL
              AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date), 0) AS consultation_refunds,
          COALESCE((SELECT SUM(t."amountVnd"::numeric) FROM transactions t
            WHERE t.type = 'COMMISSION' AND t.status = 'COMPLETED'
              AND t."toAccount" = 'PLATFORM_REVENUE'
              AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date), 0) AS platform_commission_revenue
        FROM paid_order_payments pop
        LEFT JOIN orders o ON o.id = pop."orderId"
        `,
        [period.from, period.to],
      ),
      this.dataSource.query<CountRow[]>(`
        SELECT
          (SELECT COUNT(*) FROM stock_import_forms WHERE status = 'SUBMITTED') AS submitted_stock_forms,
          (SELECT COUNT(*) FROM order_cancellations WHERE status <> 'COMPLETED') AS open_cancellations,
          (SELECT COUNT(*) FROM order_cancellations WHERE status = 'FAILED' OR "lastError" IS NOT NULL) AS failed_workflows,
          (SELECT COUNT(*) FROM users u
            WHERE u."isActive" = true
              AND string_to_array(COALESCE(u.roles, ''), ',') @> ARRAY['expert']
              AND NOT EXISTS (SELECT 1 FROM experts e WHERE e."userId" = u.id)) AS experts_missing_profile
      `),
      this.dataSource.query<CountRow[]>(
        `
        WITH paid_order_payments AS (
          SELECT DISTINCT ON (p."orderId") p."orderId", p."amountVnd", p."paidAt"
          FROM payments p
          WHERE p.purpose = 'ORDER' AND p.status = 'PAID'
            AND p."orderId" IS NOT NULL AND p."paidAt" IS NOT NULL
            AND (p."paidAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          ORDER BY p."orderId", p."paidAt" DESC
        )
        SELECT day,
          SUM(new_customers) AS new_customers,
          SUM(paid_orders) AS paid_orders,
          SUM(gross_product_sales) AS gross_product_sales,
          SUM(discounts) AS discounts,
          SUM(shipping_collected) AS shipping_collected,
          SUM(product_payments_collected) AS product_payments_collected,
          SUM(product_refunds) AS product_refunds,
          SUM(consultation_fees_collected) AS consultation_fees_collected,
          SUM(consultation_refunds) AS consultation_refunds,
          SUM(platform_commission_revenue) AS platform_commission_revenue
        FROM (
          SELECT (u."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text AS day,
            COUNT(*)::numeric AS new_customers, 0::numeric AS paid_orders,
            0::numeric AS gross_product_sales, 0::numeric AS discounts,
            0::numeric AS shipping_collected, 0::numeric AS product_payments_collected,
            0::numeric AS product_refunds, 0::numeric AS consultation_fees_collected,
            0::numeric AS consultation_refunds, 0::numeric AS platform_commission_revenue
          FROM users u
          WHERE string_to_array(COALESCE(u.roles, ''), ',') @> ARRAY['customer']
            AND (u."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          GROUP BY 1
          UNION ALL
          SELECT (pop."paidAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
            0::numeric, COUNT(*)::numeric, SUM(o."subtotalVnd")::numeric,
            SUM(o."discountVnd")::numeric, SUM(o."shippingFeeVnd")::numeric,
            SUM(pop."amountVnd"::numeric), 0::numeric, 0::numeric, 0::numeric, 0::numeric
          FROM paid_order_payments pop JOIN orders o ON o.id = pop."orderId"
          GROUP BY 1
          UNION ALL
          SELECT (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
            0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
            SUM(CASE WHEN t.type = 'REFUND' AND t."orderId" IS NOT NULL THEN t."amountVnd"::numeric ELSE 0 END),
            SUM(CASE WHEN t.type = 'CONSULTATION_PAYMENT' THEN t."amountVnd"::numeric ELSE 0 END),
            SUM(CASE WHEN t.type = 'REFUND' AND t."consultationId" IS NOT NULL THEN t."amountVnd"::numeric ELSE 0 END),
            SUM(CASE WHEN t.type = 'COMMISSION' AND t."toAccount" = 'PLATFORM_REVENUE' THEN t."amountVnd"::numeric ELSE 0 END)
          FROM transactions t
          WHERE t.status = 'COMPLETED'
            AND t.type IN ('CONSULTATION_PAYMENT', 'REFUND', 'COMMISSION')
            AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          GROUP BY 1
        ) daily
        GROUP BY day ORDER BY day
        `,
        [period.from, period.to],
      ),
      this.dataSource.query<CountRow[]>(
        `
        WITH ranged_events AS (
          SELECT * FROM commerce_analytics_events
          WHERE ("occurredAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
        ), viewed AS (
          SELECT "sessionId", MIN("occurredAt") AS viewed_at
          FROM ranged_events WHERE "eventType" = 'PRODUCT_VIEWED'
          GROUP BY "sessionId"
        ), added AS (
          SELECT v.*, MIN(e."occurredAt") AS added_at
          FROM viewed v LEFT JOIN ranged_events e
            ON e."sessionId" = v."sessionId" AND e."eventType" = 'ADDED_TO_CART'
            AND e."occurredAt" >= v.viewed_at
          GROUP BY v."sessionId", v.viewed_at
        ), checkout AS (
          SELECT a.*, MIN(e."occurredAt") AS checkout_at
          FROM added a LEFT JOIN ranged_events e
            ON e."sessionId" = a."sessionId" AND e."eventType" = 'CHECKOUT_STARTED'
            AND a.added_at IS NOT NULL AND e."occurredAt" >= a.added_at
          GROUP BY a."sessionId", a.viewed_at, a.added_at
        ), purchased AS (
          SELECT c.*, MIN(e."occurredAt") AS purchased_at
          FROM checkout c LEFT JOIN ranged_events e
            ON e."sessionId" = c."sessionId" AND e."eventType" = 'PURCHASE_COMPLETED'
            AND c.checkout_at IS NOT NULL AND e."occurredAt" >= c.checkout_at
          GROUP BY c."sessionId", c.viewed_at, c.added_at, c.checkout_at
        )
        SELECT
          COUNT(*) FILTER (WHERE viewed_at IS NOT NULL) AS viewed_sessions,
          COUNT(*) FILTER (WHERE added_at IS NOT NULL) AS added_sessions,
          COUNT(*) FILTER (WHERE checkout_at IS NOT NULL) AS checkout_sessions,
          COUNT(*) FILTER (WHERE purchased_at IS NOT NULL) AS purchased_sessions
        FROM purchased
        `,
        [period.from, period.to],
      ),
      this.dataSource.query<CountRow[]>(`
        SELECT MIN(("occurredAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date)::text AS available_from
        FROM commerce_analytics_events
      `),
      this.dataSource.query<CountRow[]>(
        `
        WITH paid_order_payments AS (
          SELECT DISTINCT ON (p."orderId") p."orderId", p."paidAt"
          FROM payments p
          WHERE p.purpose = 'ORDER' AND p.status = 'PAID'
            AND p."orderId" IS NOT NULL AND p."paidAt" IS NOT NULL
            AND (p."paidAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          ORDER BY p."orderId", p."paidAt" DESC
        )
        SELECT pr.id AS product_id, pv.id AS product_variant_id,
          pr.name AS product_name, pv.sku,
          SUM(oi.quantity) AS units_sold,
          SUM(oi."lineTotalVnd") AS gross_sales
        FROM paid_order_payments pop
        JOIN order_items oi ON oi."orderId" = pop."orderId"
        JOIN product_variants pv ON pv.id = oi."productVariantId"
        JOIN products pr ON pr.id = pv."productId"
        GROUP BY pr.id, pv.id, pr.name, pv.sku
        ORDER BY gross_sales DESC, units_sold DESC
        LIMIT 5
        `,
        [period.from, period.to],
      ),
      this.dataSource.query<CountRow[]>(
        `
        SELECT * FROM (
          SELECT u.id::text, 'USER_CREATED'::text AS type,
            'Tài khoản mới'::text AS title,
            COALESCE(u.name, u.email, 'Người dùng chưa đặt tên')::text AS description,
            NULL::numeric AS amount_vnd, u."createdAt" AS occurred_at
          FROM users u
          WHERE (u."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          UNION ALL
          SELECT p.id::text, 'PRODUCT_PAYMENT'::text,
            'Thanh toán đơn hàng'::text, p."orderId"::text,
            p."amountVnd"::numeric, p."paidAt"
          FROM payments p
          WHERE p.purpose = 'ORDER' AND p.status = 'PAID' AND p."paidAt" IS NOT NULL
            AND (p."paidAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          UNION ALL
          SELECT t.id::text,
            CASE WHEN t.type = 'CONSULTATION_PAYMENT' THEN 'CONSULTATION_PAYMENT' ELSE 'REFUND' END::text,
            CASE WHEN t.type = 'CONSULTATION_PAYMENT' THEN 'Thanh toán tư vấn' ELSE 'Hoàn tiền' END::text,
            COALESCE(t.note, t."externalRef")::text,
            t."amountVnd"::numeric, t."createdAt"
          FROM transactions t
          WHERE t.status = 'COMPLETED' AND t.type IN ('CONSULTATION_PAYMENT', 'REFUND')
            AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          UNION ALL
          SELECT c.id::text, 'ORDER_CANCELLATION'::text,
            'Yêu cầu hủy đơn'::text, c.reason::text,
            c."refundAmountVnd"::numeric, c."createdAt"
          FROM order_cancellations c
          WHERE (c."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
          UNION ALL
          SELECT f.id::text, 'STOCK_IMPORT'::text,
            'Phiếu nhập kho'::text, f.status::text,
            NULL::numeric, f."createdAt"
          FROM stock_import_forms f
          WHERE (f."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date
        ) activity
        ORDER BY occurred_at DESC LIMIT 10
        `,
        [period.from, period.to],
      ),
    ]);

    const metrics = metricsRows[0] ?? {};
    const attention = attentionRows[0] ?? {};
    const trendByDate = new Map(trendRows.map((row) => [String(row.day), row]));
    const funnel = funnelRows[0] ?? {};
    const viewed = asNumber(funnel.viewed_sessions);
    const added = asNumber(funnel.added_sessions);
    const checkout = asNumber(funnel.checkout_sessions);
    const purchased = asNumber(funnel.purchased_sessions);
    const percentage = (value: number, base: number) =>
      base > 0 ? Math.round((value / base) * 1000) / 10 : 0;
    const availableFrom = availabilityRows[0]?.available_from
      ? String(availabilityRows[0].available_from)
      : null;

    return {
      period,
      metrics: {
        activeCustomers: asNumber(metrics.active_customers),
        activeExperts: asNumber(metrics.active_experts),
        activeClinics: asNumber(metrics.active_clinics),
        paidOrders: asNumber(metrics.paid_orders),
        grossProductSalesVnd: asNumber(metrics.gross_product_sales),
        discountsVnd: asNumber(metrics.discounts),
        shippingCollectedVnd: asNumber(metrics.shipping_collected),
        productPaymentsCollectedVnd: asNumber(
          metrics.product_payments_collected,
        ),
        productRefundsVnd: asNumber(metrics.product_refunds),
        averageOrderValueVnd: asNumber(metrics.average_order_value),
        consultationFeesCollectedVnd: asNumber(
          metrics.consultation_fees_collected,
        ),
        consultationRefundsVnd: asNumber(metrics.consultation_refunds),
        platformCommissionRevenueVnd: asNumber(
          metrics.platform_commission_revenue,
        ),
      },
      attention: {
        submittedStockForms: asNumber(attention.submitted_stock_forms),
        openCancellations: asNumber(attention.open_cancellations),
        failedWorkflows: asNumber(attention.failed_workflows),
        expertsMissingProfile: asNumber(attention.experts_missing_profile),
      },
      trend: dashboardDateKeys(period).map((date) => {
        const row = trendByDate.get(date);
        return {
          date,
          newCustomers: asNumber(row?.new_customers),
          paidOrders: asNumber(row?.paid_orders),
          grossProductSalesVnd: asNumber(row?.gross_product_sales),
          discountsVnd: asNumber(row?.discounts),
          shippingCollectedVnd: asNumber(row?.shipping_collected),
          productPaymentsCollectedVnd: asNumber(
            row?.product_payments_collected,
          ),
          productRefundsVnd: asNumber(row?.product_refunds),
          consultationFeesCollectedVnd: asNumber(
            row?.consultation_fees_collected,
          ),
          consultationRefundsVnd: asNumber(row?.consultation_refunds),
          platformCommissionRevenueVnd: asNumber(
            row?.platform_commission_revenue,
          ),
        };
      }),
      funnel: {
        availableFrom,
        isPartial: availableFrom == null || period.from < availableFrom,
        steps: [
          {
            eventType: 'PRODUCT_VIEWED',
            label: 'Xem sản phẩm',
            sessions: viewed,
            conversionFromPreviousPct: viewed > 0 ? 100 : 0,
            overallConversionPct: viewed > 0 ? 100 : 0,
          },
          {
            eventType: 'ADDED_TO_CART',
            label: 'Thêm vào giỏ',
            sessions: added,
            conversionFromPreviousPct: percentage(added, viewed),
            overallConversionPct: percentage(added, viewed),
          },
          {
            eventType: 'CHECKOUT_STARTED',
            label: 'Bắt đầu thanh toán',
            sessions: checkout,
            conversionFromPreviousPct: percentage(checkout, added),
            overallConversionPct: percentage(checkout, viewed),
          },
          {
            eventType: 'PURCHASE_COMPLETED',
            label: 'Thanh toán thành công',
            sessions: purchased,
            conversionFromPreviousPct: percentage(purchased, checkout),
            overallConversionPct: percentage(purchased, viewed),
          },
        ],
      },
      topProducts: topProductRows.map((row) => ({
        productId: String(row.product_id),
        productVariantId: String(row.product_variant_id),
        productName: String(row.product_name),
        sku: String(row.sku),
        unitsSold: asNumber(row.units_sold),
        grossSalesVnd: asNumber(row.gross_sales),
      })),
      recentActivity: activityRows.map(
        (row): DashboardActivityDto => ({
          id: String(row.id),
          type: String(row.type),
          title: String(row.title),
          description: row.description == null ? null : String(row.description),
          amountVnd: row.amount_vnd == null ? null : asNumber(row.amount_vnd),
          occurredAt: new Date(String(row.occurred_at)),
        }),
      ),
    };
  }

  async getExpertDashboard(
    userId: string,
    range = DashboardRange.THIRTY_DAYS,
  ): Promise<ExpertDashboardResponseDto> {
    const period = resolveDashboardPeriod(range);
    const expertRows = await this.dataSource.query<{ id: string }[]>(
      'SELECT id FROM experts WHERE "userId" = $1 LIMIT 1',
      [userId],
    );
    const expertId = expertRows[0]?.id;
    if (!expertId)
      throw new NotFoundException('Không tìm thấy hồ sơ chuyên gia');

    const [metricRows, trendRows, pendingRows, upcomingRows] =
      await Promise.all([
        this.dataSource.query<CountRow[]>(
          `
          SELECT
            (SELECT COUNT(*) FROM consultation_requests c
              WHERE c."expertId" = $1 AND c.status <> 'CANCELLED'
              AND (c."scheduledAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date = $4::date) AS appointments_today,
            (SELECT COUNT(*) FROM consultation_requests c
              WHERE c."expertId" = $1 AND c.status = 'PENDING'
              AND (c."paidTransactionId" IS NOT NULL OR c."isFollowUp" = true)) AS paid_pending,
            (SELECT COUNT(*) FROM consultation_requests c
              WHERE c."expertId" = $1 AND c.status = 'COMPLETED'
              AND (c."completedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $2::date AND $3::date) AS completed,
            (SELECT COUNT(*) FROM consultation_requests c
              WHERE c."expertId" = $1 AND c."isFollowUp" = true
              AND (c."scheduledAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $2::date AND $3::date) AS follow_ups,
            (SELECT COALESCE(SUM(CASE
                WHEN t.type = 'CONSULTATION_PAYMENT' AND t.status = 'COMPLETED' THEN t."amountVnd"::numeric
                WHEN t.type = 'REFUND' AND t.status = 'COMPLETED' THEN -t."amountVnd"::numeric
                ELSE 0 END), 0)
              FROM transactions t JOIN consultation_requests c ON c.id = t."consultationId"
              WHERE c."expertId" = $1
                AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $2::date AND $3::date) AS net_fees,
            (SELECT COALESCE(AVG(f.rating), 0) FROM feedbacks f
              JOIN consultation_requests c ON c.id = f."consultationId" WHERE c."expertId" = $1) AS average_rating,
            (SELECT COUNT(*) FROM feedbacks f
              JOIN consultation_requests c ON c.id = f."consultationId" WHERE c."expertId" = $1) AS rating_count
          `,
          [expertId, period.from, period.to, period.to],
        ),
        this.dataSource.query<CountRow[]>(
          `
          SELECT day, SUM(completed) AS completed, SUM(net_fees) AS net_fees
          FROM (
            SELECT (c."completedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text AS day,
              COUNT(*)::numeric AS completed, 0::numeric AS net_fees
            FROM consultation_requests c
            WHERE c."expertId" = $1 AND c.status = 'COMPLETED'
              AND (c."completedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $2::date AND $3::date
            GROUP BY 1
            UNION ALL
            SELECT (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
              0::numeric,
              SUM(CASE WHEN t.type = 'CONSULTATION_PAYMENT' AND t.status = 'COMPLETED' THEN t."amountVnd"::numeric
                WHEN t.type = 'REFUND' AND t.status = 'COMPLETED' THEN -t."amountVnd"::numeric ELSE 0 END)
            FROM transactions t JOIN consultation_requests c ON c.id = t."consultationId"
            WHERE c."expertId" = $1
              AND (t."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $2::date AND $3::date
            GROUP BY 1
          ) daily GROUP BY day ORDER BY day
          `,
          [expertId, period.from, period.to],
        ),
        this.bookingQueue(expertId, true),
        this.bookingQueue(expertId, false),
      ]);

    const metric = metricRows[0] ?? {};
    const trendByDate = new Map(trendRows.map((row) => [String(row.day), row]));
    return {
      period,
      metrics: {
        appointmentsToday: asNumber(metric.appointments_today),
        paidPendingConfirmation: asNumber(metric.paid_pending),
        completedConsultations: asNumber(metric.completed),
        followUpConsultations: asNumber(metric.follow_ups),
        netConsultationFeesVnd: asNumber(metric.net_fees),
        averageRating: Number(asNumber(metric.average_rating).toFixed(2)),
        ratingCount: asNumber(metric.rating_count),
      },
      trend: dashboardDateKeys(period).map((date) => {
        const row = trendByDate.get(date);
        return {
          date,
          completedConsultations: asNumber(row?.completed),
          netConsultationFeesVnd: asNumber(row?.net_fees),
        };
      }),
      pendingConfirmation: pendingRows,
      upcomingBookings: upcomingRows,
    };
  }

  async getStaffDashboard(
    userId: string,
    range = DashboardRange.THIRTY_DAYS,
  ): Promise<StaffDashboardResponseDto> {
    const period = resolveDashboardPeriod(range);
    const [
      metricRows,
      trendRows,
      supportRows,
      stockRows,
      returnRows,
      failures,
    ] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `
          SELECT
            (SELECT COUNT(*) FROM support_sessions WHERE status = 'OPEN' AND "assignedStaffUserId" IS NULL) AS open_support,
            (SELECT COUNT(*) FROM support_sessions WHERE status = 'ACTIVE' AND "assignedStaffUserId" = $1) AS my_active_support,
            (SELECT COUNT(*) FROM stock_import_forms WHERE status = 'SUBMITTED') AS submitted_stock,
            (SELECT COUNT(*) FROM order_cancellations c JOIN deliveries d ON d."orderId" = c."orderId"
              WHERE c.status = 'AWAITING_RETURN' AND d.status = 'RETURNED') AS ready_returns,
            (SELECT COUNT(*) FROM order_cancellations WHERE status = 'FAILED' OR "lastError" IS NOT NULL) AS failed_workflows
          `,
        [userId],
      ),
      this.dataSource.query<CountRow[]>(
        `
          SELECT day, SUM(opened_support) AS opened_support,
            SUM(closed_support) AS closed_support,
            SUM(submitted_stock) AS submitted_stock,
            SUM(confirmed_stock) AS confirmed_stock
          FROM (
            SELECT (s."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text AS day,
              COUNT(*)::numeric AS opened_support, 0::numeric AS closed_support,
              0::numeric AS submitted_stock, 0::numeric AS confirmed_stock
            FROM support_sessions s
            WHERE (s."createdAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date GROUP BY 1
            UNION ALL
            SELECT (s."closedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
              0::numeric, COUNT(*)::numeric, 0::numeric, 0::numeric
            FROM support_sessions s
            WHERE s."closedAt" IS NOT NULL AND (s."closedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date GROUP BY 1
            UNION ALL
            SELECT (f."submittedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
              0::numeric, 0::numeric, COUNT(*)::numeric, 0::numeric
            FROM stock_import_forms f
            WHERE f."submittedAt" IS NOT NULL AND (f."submittedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date GROUP BY 1
            UNION ALL
            SELECT (f."confirmedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date::text,
              0::numeric, 0::numeric, 0::numeric, COUNT(*)::numeric
            FROM stock_import_forms f
            WHERE f."confirmedAt" IS NOT NULL AND (f."confirmedAt" AT TIME ZONE '${DASHBOARD_TIMEZONE}')::date BETWEEN $1::date AND $2::date GROUP BY 1
          ) daily GROUP BY day ORDER BY day
          `,
        [period.from, period.to],
      ),
      this.dataSource.query<CountRow[]>(`
          SELECT s.id, u.name AS customer_name, s.subject, s."createdAt" AS waiting_since
          FROM support_sessions s JOIN users u ON u.id = s."customerUserId"
          WHERE s.status = 'OPEN' AND s."assignedStaffUserId" IS NULL
          ORDER BY s."createdAt" ASC LIMIT 5
        `),
      this.dataSource.query<CountRow[]>(`
          SELECT f.id, v.sku, p.name AS product_name, f.quantity, f."submittedAt" AS submitted_at
          FROM stock_import_forms f
          JOIN product_variants v ON v.id = f."productVariantId"
          JOIN products p ON p.id = v."productId"
          WHERE f.status = 'SUBMITTED'
          ORDER BY f."submittedAt" ASC NULLS LAST LIMIT 5
        `),
      this.dataSource.query<CountRow[]>(`
          SELECT c.id, c."orderId" AS order_id, c."refundAmountVnd" AS refund_amount,
            COALESCE(d."lastStatusAt", d."updatedAt") AS returned_at
          FROM order_cancellations c JOIN deliveries d ON d."orderId" = c."orderId"
          WHERE c.status = 'AWAITING_RETURN' AND d.status = 'RETURNED'
          ORDER BY COALESCE(d."lastStatusAt", d."updatedAt") ASC LIMIT 5
        `),
      this.dataSource.query<CountRow[]>(`
          SELECT id, "orderId" AS order_id, status, "lastError" AS last_error, "updatedAt" AS updated_at
          FROM order_cancellations
          WHERE status = 'FAILED' OR "lastError" IS NOT NULL
          ORDER BY "updatedAt" ASC LIMIT 5
        `),
    ]);

    const metric = metricRows[0] ?? {};
    const trendByDate = new Map(trendRows.map((row) => [String(row.day), row]));
    return {
      period,
      metrics: {
        unassignedOpenSupport: asNumber(metric.open_support),
        myActiveSupport: asNumber(metric.my_active_support),
        submittedStockForms: asNumber(metric.submitted_stock),
        returnsReadyForInspection: asNumber(metric.ready_returns),
        failedWorkflows: asNumber(metric.failed_workflows),
      },
      trend: dashboardDateKeys(period).map((date) => {
        const row = trendByDate.get(date);
        return {
          date,
          openedSupportSessions: asNumber(row?.opened_support),
          closedSupportSessions: asNumber(row?.closed_support),
          submittedStockForms: asNumber(row?.submitted_stock),
          confirmedStockForms: asNumber(row?.confirmed_stock),
        };
      }),
      queues: {
        openSupportSessions: supportRows.map((row) => ({
          id: String(row.id),
          customerName:
            row.customer_name == null ? null : String(row.customer_name),
          subject: row.subject == null ? null : String(row.subject),
          waitingSince: new Date(String(row.waiting_since)),
        })),
        submittedStockForms: stockRows.map((row) => ({
          id: String(row.id),
          sku: String(row.sku),
          productName: String(row.product_name),
          quantity: asNumber(row.quantity),
          submittedAt: new Date(String(row.submitted_at)),
        })),
        readyReturns: returnRows.map((row) => ({
          id: String(row.id),
          orderId: String(row.order_id),
          refundAmountVnd: asNumber(row.refund_amount),
          returnedAt: new Date(String(row.returned_at)),
        })),
        workflowFailures: failures.map((row) => ({
          id: String(row.id),
          orderId: String(row.order_id),
          status: String(row.status),
          lastError: row.last_error == null ? null : String(row.last_error),
          updatedAt: new Date(String(row.updated_at)),
        })),
      },
    };
  }

  private async bookingQueue(
    expertId: string,
    pending: boolean,
  ): Promise<ExpertBookingQueueItemDto[]> {
    const rows = await this.dataSource.query<CountRow[]>(
      `
      SELECT c.id, u.name AS customer_name, c.reason, c."scheduledAt" AS scheduled_at,
        c."isFollowUp" AS is_follow_up, COALESCE(c."feeChargedVnd", 0) AS fee_charged
      FROM consultation_requests c
      JOIN customers customer ON customer.id = c."customerId"
      LEFT JOIN users u ON u.id = customer."userId"
      WHERE c."expertId" = $1
        AND ${pending ? 'c.status = \'PENDING\' AND (c."paidTransactionId" IS NOT NULL OR c."isFollowUp" = true)' : 'c.status = \'CONFIRMED\' AND c."scheduledAt" >= NOW()'}
      ORDER BY c."scheduledAt" ASC LIMIT 5
      `,
      [expertId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      customerName:
        row.customer_name == null ? null : String(row.customer_name),
      reason: row.reason == null ? null : String(row.reason),
      scheduledAt: new Date(String(row.scheduled_at)),
      isFollowUp: row.is_follow_up === true || row.is_follow_up === 'true',
      feeChargedVnd: asNumber(row.fee_charged),
    }));
  }
}
