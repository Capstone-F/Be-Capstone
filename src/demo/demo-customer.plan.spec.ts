import { RoutinePeriod, StockWarningLevel } from '../routines/enums';
import {
  estimateVariantStock,
  LOW_STOCK_DAYS_LEFT,
} from '../routines/routine-tracking.rules';
import {
  clampHistoryDays,
  DEMO_HISTORY_DAYS_DEFAULT,
  DEMO_HISTORY_DAYS_MAX,
  DEMO_HISTORY_DAYS_MIN,
  planDemoRoutine,
  type DemoCatalogVariant,
  type DemoRoutinePlan,
} from './demo-customer.plan';

const TODAY = '2026-08-14';

/** Mirrors the seeded catalog (src/database/seeds/seed.ts), ml variants only. */
const CATALOG: DemoCatalogVariant[] = [
  {
    id: 'v-cleanser',
    sku: 'CERAVE-FOAM-CLEANSER-236ML',
    productName: 'Sữa rửa mặt tạo bọt CeraVe',
    categoryCode: 'CLEANSER',
    bottleMl: 236,
    priceVnd: 3200,
  },
  {
    id: 'v-toner',
    sku: 'SOMEBYMI-MIRACLE-TONER-150ML',
    productName: 'Toner Some By Mi AHA BHA PHA 30 Days Miracle',
    categoryCode: 'TONER',
    bottleMl: 150,
    priceVnd: 2800,
  },
  {
    id: 'v-serum',
    sku: 'TO-NIACINAMIDE-10-ZINC-30ML',
    productName: 'Tinh chất The Ordinary Niacinamide 10% + Zinc 1%',
    categoryCode: 'SERUM',
    bottleMl: 30,
    priceVnd: 1800,
  },
  {
    id: 'v-sunscreen',
    sku: 'LRP-ANTHELIOS-UVMUNE-50ML',
    productName: 'Kem chống nắng La Roche-Posay Anthelios UVMune 400 SPF50+',
    categoryCode: 'SUNSCREEN',
    bottleMl: 50,
    priceVnd: 5200,
  },
  {
    id: 'v-treatment',
    sku: 'LRP-EFFAC-DUO-40ML',
    productName: 'Kem trị mụn La Roche-Posay Effaclar Duo+',
    categoryCode: 'TREATMENT',
    bottleMl: 40,
    priceVnd: 3800,
  },
  {
    id: 'v-moisturizer',
    sku: 'LRP-TOLERIANE-SENSITIVE-40ML',
    productName: 'Kem dưỡng dịu nhẹ La Roche-Posay Toleriane Sensitive Fluid',
    categoryCode: 'MOISTURIZER',
    bottleMl: 40,
    priceVnd: 3900,
  },
];

/**
 * Recompute the warning the way RoutineTrackingService.buildStockContext does,
 * straight from the rows this plan would persist. This is the assertion that
 * actually protects the demo: one purchased bottle per variant (the
 * sourceOrderId fallback), usage summed across every linked step.
 */
function estimateFromPlannedSteps(
  plan: DemoRoutinePlan,
  variantId: string,
): ReturnType<typeof estimateVariantStock> {
  const steps = plan.steps.filter((step) => step.variant.id === variantId);
  const dailyUsageMl = steps.reduce((sum, step) => sum + step.amountMl, 0);
  const usedMl = steps.reduce(
    (sum, step) => sum + plan.completedDays * step.amountMl,
    0,
  );

  return estimateVariantStock({
    bottleMl: steps[0].variant.bottleMl,
    purchasedQty: 1,
    usedMl,
    dailyUsageMl,
    canTrackUsage: true,
  });
}

describe('planDemoRoutine', () => {
  const plan = planDemoRoutine({
    variants: CATALOG,
    today: TODAY,
    historyDays: DEMO_HISTORY_DAYS_DEFAULT,
  });

  it('lays out morning and evening steps in product-role order', () => {
    const morning = plan.steps.filter(
      (s) => s.period === RoutinePeriod.MORNING,
    );
    const evening = plan.steps.filter(
      (s) => s.period === RoutinePeriod.EVENING,
    );

    expect(morning.map((s) => s.role)).toEqual([
      'CLEANSER',
      'TONER',
      'SERUM',
      'SUNSCREEN',
    ]);
    expect(evening.map((s) => s.role)).toEqual([
      'CLEANSER',
      'TONER',
      'TREATMENT',
      'MOISTURIZER',
    ]);
    expect(morning.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4]);
    expect(evening.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4]);
  });

  it('reuses one variant per role, including across periods', () => {
    const cleanserSteps = plan.steps.filter((s) => s.role === 'CLEANSER');
    expect(cleanserSteps).toHaveLength(2);
    expect(new Set(cleanserSteps.map((s) => s.variant.id)).size).toBe(1);
  });

  it('backdates the routine and stops the seeded history at yesterday', () => {
    expect(plan.activeFromDate).toBe('2026-07-31');
    expect(plan.days).toHaveLength(DEMO_HISTORY_DAYS_DEFAULT);
    expect(plan.days[0].date).toBe('2026-07-31');
    expect(plan.days[plan.days.length - 1].date).toBe('2026-08-13');
    expect(plan.days.some((day) => day.date === TODAY)).toBe(false);
  });

  it('leaves a couple of missed days and keeps a trailing streak', () => {
    expect(plan.missedDays).toBe(2);
    expect(plan.completedDays).toBe(DEMO_HISTORY_DAYS_DEFAULT - 2);
    expect(plan.days.filter((d) => !d.completed).map((d) => d.date)).toEqual([
      '2026-08-02',
      '2026-08-05',
    ]);
    expect(plan.currentStreak).toBe(8);
  });

  it('writes one check-in per completed day, with trending skin scores', () => {
    const checkIns = plan.days
      .map((day) => day.checkIn)
      .filter((checkIn) => checkIn !== null);
    expect(checkIns).toHaveLength(plan.completedDays);
    expect(checkIns.every((c) => c.period === RoutinePeriod.EVENING)).toBe(
      true,
    );

    const first = checkIns[0];
    const last = checkIns[checkIns.length - 1];
    expect(first.acneLevel).toBeGreaterThan(last.acneLevel);
    expect(first.moistureLevel).toBeLessThan(last.moistureLevel);
    expect(first.sideEffects).toHaveLength(1);
    expect(last.sideEffects).toHaveLength(0);
  });

  it('picks the smallest bottle as the low-stock product', () => {
    expect(plan.lowStockVariantId).toBe('v-serum');
  });

  it('leaves the low-stock product LOW but not empty on Today', () => {
    const estimate = estimateFromPlannedSteps(plan, 'v-serum');
    expect(estimate.warning).toBe(StockWarningLevel.LOW);
    expect(estimate.daysLeft).toBeGreaterThan(0);
    expect(estimate.daysLeft).toBeLessThanOrEqual(LOW_STOCK_DAYS_LEFT);
    expect(estimate.remainingMl).toBeGreaterThan(0);
  });

  it('leaves every other product without a warning', () => {
    const others = [...new Set(plan.steps.map((s) => s.variant.id))].filter(
      (id) => id !== plan.lowStockVariantId,
    );
    expect(others.length).toBeGreaterThan(0);

    for (const variantId of others) {
      const estimate = estimateFromPlannedSteps(plan, variantId);
      expect(estimate.warning).toBeNull();
      expect(estimate.daysLeft).toBeGreaterThan(LOW_STOCK_DAYS_LEFT);
    }
  });

  it('reports the same outlook it hands to the seeder', () => {
    for (const outlook of plan.stockOutlook) {
      const estimate = estimateFromPlannedSteps(plan, outlook.variantId);
      expect(outlook.warning).toBe(estimate.warning);
      expect(outlook.remainingMl).toBe(estimate.remainingMl);
      expect(outlook.daysLeft).toBe(estimate.daysLeft);
    }
  });

  it('holds the LOW guarantee across the whole historyDays range', () => {
    const warningsByHistoryDays: Array<[number, string]> = [];

    for (
      let historyDays = DEMO_HISTORY_DAYS_MIN;
      historyDays <= DEMO_HISTORY_DAYS_MAX;
      historyDays += 1
    ) {
      const candidate = planDemoRoutine({
        variants: CATALOG,
        today: TODAY,
        historyDays,
      });
      expect(candidate.currentStreak).toBeGreaterThanOrEqual(3);

      const warnings = [...new Set(candidate.steps.map((s) => s.variant.id))]
        .map((variantId) => {
          const { warning } = estimateFromPlannedSteps(candidate, variantId);
          return variantId === candidate.lowStockVariantId
            ? `low:${warning}`
            : `other:${warning}`;
        })
        .sort()
        .join(',');
      warningsByHistoryDays.push([historyDays, warnings]);
    }

    const expected = `low:${StockWarningLevel.LOW},other:null,other:null,other:null,other:null,other:null`;
    expect(warningsByHistoryDays).toEqual(
      warningsByHistoryDays.map(([historyDays]) => [historyDays, expected]),
    );
  });

  it('still builds a routine from a two-product catalog', () => {
    const small = planDemoRoutine({
      variants: [CATALOG[0], CATALOG[2]],
      today: TODAY,
      historyDays: DEMO_HISTORY_DAYS_DEFAULT,
    });

    expect(small.steps.map((s) => s.role)).toEqual([
      'CLEANSER',
      'SERUM',
      'CLEANSER',
    ]);
    expect(
      estimateFromPlannedSteps(small, small.lowStockVariantId).warning,
    ).toBe(StockWarningLevel.LOW);
  });

  it('rejects a catalog that cannot fill two steps', () => {
    expect(() =>
      planDemoRoutine({
        variants: [CATALOG[2]],
        today: TODAY,
        historyDays: DEMO_HISTORY_DAYS_DEFAULT,
      }),
    ).toThrow(/ml-based product variants/);
  });
});

describe('clampHistoryDays', () => {
  it('defaults when unset and clamps to the supported range', () => {
    expect(clampHistoryDays(undefined)).toBe(DEMO_HISTORY_DAYS_DEFAULT);
    expect(clampHistoryDays(1)).toBe(DEMO_HISTORY_DAYS_MIN);
    expect(clampHistoryDays(999)).toBe(DEMO_HISTORY_DAYS_MAX);
    expect(clampHistoryDays(21)).toBe(21);
  });
});
