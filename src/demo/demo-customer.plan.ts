/**
 * Deterministic plan for the admin demo-customer seeder.
 *
 * Kept pure (no DB, no clock) so the numbers can be asserted in tests. The
 * per-step `amountMl` is derived backwards from the desired outcome: after the
 * seeded history is replayed, exactly one product must have ≤ LOW_STOCK_DAYS_LEFT
 * days of supply left. The outlook below is computed with the very same
 * `estimateVariantStock` that `GET /routines/me/today` uses, so whatever this
 * plan predicts is what the customer will actually see.
 */
import {
  CheckInMood,
  RoutinePeriod,
  SideEffectType,
  StockWarningLevel,
} from '../routines/enums';
import {
  estimateVariantStock,
  shiftDate,
  type StepStockEstimate,
} from '../routines/routine-tracking.rules';
import {
  resolveDefaultDosage,
  resolveDefaultInstructions,
  resolveDefaultWaitMinutes,
  resolveRoutineStepRole,
  type RoutineStepRole,
} from '../routines/routine-step-defaults';

export const DEMO_HISTORY_DAYS_DEFAULT = 14;
export const DEMO_HISTORY_DAYS_MIN = 7;
export const DEMO_HISTORY_DAYS_MAX = 60;

/** Days of supply left on the one product we want flagged LOW. */
const TARGET_DAYS_LEFT_LOW = 2;
/** Days of supply left on every other product, comfortably clear of the LOW threshold. */
const TARGET_DAYS_LEFT_HEALTHY = 20;
/** Offsets from the oldest seeded day that get no step actions → MISSED on the calendar. */
const MISSED_DAY_OFFSETS = [2, 5];
/** Most recent days always kept COMPLETED so the streak is worth showing. */
const MIN_TRAILING_STREAK = 3;
/** Smallest dosage we will store, so decimal(8,2) rounding can never reach 0. */
const MIN_AMOUNT_ML = 0.01;

/** Steps are laid out in this order within a period. */
const STEP_LAYOUT: ReadonlyArray<{
  period: RoutinePeriod;
  role: RoutineStepRole;
}> = [
  { period: RoutinePeriod.MORNING, role: 'CLEANSER' },
  { period: RoutinePeriod.MORNING, role: 'TONER' },
  { period: RoutinePeriod.MORNING, role: 'SERUM' },
  { period: RoutinePeriod.MORNING, role: 'SUNSCREEN' },
  { period: RoutinePeriod.EVENING, role: 'CLEANSER' },
  { period: RoutinePeriod.EVENING, role: 'TONER' },
  { period: RoutinePeriod.EVENING, role: 'TREATMENT' },
  { period: RoutinePeriod.EVENING, role: 'MOISTURIZER' },
];

/** A routine needs at least this many steps to be worth demoing. */
export const DEMO_MIN_STEPS = 2;

/** Catalog candidate: an active variant whose volume is expressed in ml. */
export type DemoCatalogVariant = {
  id: string;
  sku: string;
  productName: string;
  categoryCode: string | null;
  /** Bottle size in ml, already parsed from `product_variants.volume`. */
  bottleMl: number;
  priceVnd: number;
};

export type DemoStepPlan = {
  role: RoutineStepRole;
  period: RoutinePeriod;
  stepOrder: number;
  name: string;
  instructions: string;
  dosageText: string;
  waitMinutes: number;
  variant: DemoCatalogVariant;
  /** Per-application dose, 2 decimals to match the decimal(8,2) column. */
  amountMl: number;
};

export type DemoSideEffectPlan = {
  type: SideEffectType;
  severity: number;
  note: string;
};

export type DemoCheckInPlan = {
  period: RoutinePeriod;
  overallMood: CheckInMood;
  acneLevel: number;
  oilLevel: number;
  rednessLevel: number;
  moistureLevel: number;
  completionRate: number;
  note: string;
  sideEffects: DemoSideEffectPlan[];
};

export type DemoDayPlan = {
  /** YYYY-MM-DD, Asia/Ho_Chi_Minh calendar date. */
  date: string;
  /** true → every step of both periods is recorded COMPLETED. */
  completed: boolean;
  checkIn: DemoCheckInPlan | null;
};

export type DemoStockOutlook = {
  variantId: string;
  sku: string;
  productName: string;
  bottleMl: number;
  /** Planned ml per day across every step using this variant. */
  dailyMl: number;
  usedMl: number;
  remainingMl: number | null;
  daysLeft: number | null;
  warning: StockWarningLevel | null;
};

export type DemoRoutinePlan = {
  /** VN date the routine is backdated to; also the first day on the calendar. */
  activeFromDate: string;
  steps: DemoStepPlan[];
  days: DemoDayPlan[];
  completedDays: number;
  missedDays: number;
  currentStreak: number;
  /** Variant the demo should show a LOW warning for. */
  lowStockVariantId: string;
  stockOutlook: DemoStockOutlook[];
};

export function clampHistoryDays(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEMO_HISTORY_DAYS_DEFAULT;
  }
  return Math.min(
    DEMO_HISTORY_DAYS_MAX,
    Math.max(DEMO_HISTORY_DAYS_MIN, Math.trunc(value)),
  );
}

/**
 * Assign one variant per step role. A variant only ever fills one role, so the
 * routine shows distinct products; SKU ordering keeps the choice deterministic.
 */
export function pickVariantsByRole(
  variants: DemoCatalogVariant[],
): Map<RoutineStepRole, DemoCatalogVariant> {
  const sorted = [...variants].sort((a, b) => a.sku.localeCompare(b.sku));
  const byRole = new Map<RoutineStepRole, DemoCatalogVariant>();
  const used = new Set<string>();

  for (const { role } of STEP_LAYOUT) {
    if (byRole.has(role)) continue;
    const match = sorted.find(
      (variant) =>
        !used.has(variant.id) &&
        resolveRoutineStepRole({
          categoryCode: variant.categoryCode,
          productName: variant.productName,
        }) === role,
    );
    if (match) {
      byRole.set(role, match);
      used.add(match.id);
    }
  }

  return byRole;
}

export function planDemoRoutine(params: {
  variants: DemoCatalogVariant[];
  /** Today in Asia/Ho_Chi_Minh (YYYY-MM-DD). */
  today: string;
  historyDays: number;
}): DemoRoutinePlan {
  const { today } = params;
  const historyDays = clampHistoryDays(params.historyDays);
  const byRole = pickVariantsByRole(params.variants);

  const steps = buildSteps(byRole);
  if (steps.length < DEMO_MIN_STEPS) {
    throw new Error(
      'Catalog does not have enough active ml-based product variants to build a demo routine',
    );
  }

  const days = buildDays(today, historyDays);
  const completedDays = days.filter((d) => d.completed).length;
  const lowStockVariantId = pickLowStockVariantId(steps);

  const stockOutlook = assignDosages(steps, completedDays, lowStockVariantId);
  attachCheckIns(days);

  return {
    activeFromDate: shiftDate(today, -historyDays),
    steps,
    days,
    completedDays,
    missedDays: days.length - completedDays,
    currentStreak: trailingStreak(days),
    lowStockVariantId,
    stockOutlook,
  };
}

function buildSteps(
  byRole: Map<RoutineStepRole, DemoCatalogVariant>,
): DemoStepPlan[] {
  const steps: DemoStepPlan[] = [];
  const orderByPeriod = new Map<RoutinePeriod, number>();

  for (const { period, role } of STEP_LAYOUT) {
    const variant = byRole.get(role);
    if (!variant) continue;

    const stepOrder = (orderByPeriod.get(period) ?? 0) + 1;
    orderByPeriod.set(period, stepOrder);

    const roleInput = {
      categoryCode: role,
      productName: variant.productName,
    };
    steps.push({
      role,
      period,
      stepOrder,
      name: variant.productName,
      instructions: resolveDefaultInstructions(roleInput),
      dosageText: resolveDefaultDosage(roleInput).dosageText,
      waitMinutes: resolveDefaultWaitMinutes(roleInput, stepOrder === 1),
      variant,
      // Replaced by assignDosages once the completed-day count is known.
      amountMl: 0,
    });
  }

  return steps;
}

function buildDays(today: string, historyDays: number): DemoDayPlan[] {
  const missed = new Set(
    MISSED_DAY_OFFSETS.filter(
      (offset) => offset < historyDays - MIN_TRAILING_STREAK,
    ),
  );

  const days: DemoDayPlan[] = [];
  for (let offset = 0; offset < historyDays; offset += 1) {
    days.push({
      date: shiftDate(today, offset - historyDays),
      completed: !missed.has(offset),
      checkIn: null,
    });
  }
  return days;
}

/** The smallest bottle runs out first — that is the product we flag LOW. */
function pickLowStockVariantId(steps: DemoStepPlan[]): string {
  const smallest = [...steps]
    .map((step) => step.variant)
    .sort((a, b) => a.bottleMl - b.bottleMl || a.sku.localeCompare(b.sku))[0];
  return smallest.id;
}

/**
 * Size each dose so replaying `completedDays` of history lands the chosen
 * variant on ~TARGET_DAYS_LEFT_LOW days of supply and everything else on
 * ~TARGET_DAYS_LEFT_HEALTHY.
 */
function assignDosages(
  steps: DemoStepPlan[],
  completedDays: number,
  lowStockVariantId: string,
): DemoStockOutlook[] {
  const stepsByVariant = new Map<string, DemoStepPlan[]>();
  for (const step of steps) {
    const bucket = stepsByVariant.get(step.variant.id) ?? [];
    bucket.push(step);
    stepsByVariant.set(step.variant.id, bucket);
  }

  const outlook: DemoStockOutlook[] = [];
  for (const [variantId, variantSteps] of stepsByVariant) {
    const { bottleMl, sku, productName } = variantSteps[0].variant;
    const targetDaysLeft =
      variantId === lowStockVariantId
        ? TARGET_DAYS_LEFT_LOW
        : TARGET_DAYS_LEFT_HEALTHY;

    const dailyMl = bottleMl / (completedDays + targetDaysLeft);
    const amountMl = Math.max(
      MIN_AMOUNT_ML,
      round2(dailyMl / variantSteps.length),
    );
    for (const step of variantSteps) {
      step.amountMl = amountMl;
    }

    // Recompute from the stored (rounded) dose, exactly as the Today endpoint does.
    const actualDailyMl = round2(amountMl * variantSteps.length);
    const estimate: StepStockEstimate = estimateVariantStock({
      bottleMl,
      purchasedQty: 1,
      usedMl: completedDays * actualDailyMl,
      dailyUsageMl: actualDailyMl,
      canTrackUsage: true,
    });

    outlook.push({
      variantId,
      sku,
      productName,
      bottleMl,
      dailyMl: actualDailyMl,
      usedMl: round2(completedDays * actualDailyMl),
      remainingMl: estimate.remainingMl,
      daysLeft: estimate.daysLeft,
      warning: estimate.warning,
    });
  }

  return outlook;
}

/**
 * One evening check-in per completed day, with skin scores trending better and
 * early irritation that fades — enough shape for the history chart to read well.
 */
function attachCheckIns(days: DemoDayPlan[]): void {
  const completed = days.filter((day) => day.completed);

  completed.forEach((day, index) => {
    const progress = completed.length <= 1 ? 1 : index / (completed.length - 1);
    day.checkIn = {
      period: RoutinePeriod.EVENING,
      overallMood: moodForProgress(progress),
      acneLevel: Math.round(4 - 3 * progress),
      oilLevel: Math.round(4 - 2 * progress),
      rednessLevel: Math.round(3 - 2 * progress),
      moistureLevel: Math.round(2 + 2 * progress),
      completionRate: 100,
      note: noteForProgress(progress),
      sideEffects: sideEffectsForIndex(index),
    };
  });
}

function moodForProgress(progress: number): CheckInMood {
  if (progress < 0.3) return CheckInMood.BAD;
  if (progress < 0.7) return CheckInMood.OK;
  return CheckInMood.GOOD;
}

function noteForProgress(progress: number): string {
  if (progress < 0.3) {
    return 'Da còn châm chích nhẹ khi mới bắt đầu, vẫn theo đúng các bước.';
  }
  if (progress < 0.7) {
    return 'Da đỡ đỏ hơn, mụn viêm giảm dần.';
  }
  return 'Da mịn và đều màu hơn hẳn, cảm giác đủ ẩm cả ngày.';
}

function sideEffectsForIndex(index: number): DemoSideEffectPlan[] {
  if (index === 0) {
    return [
      {
        type: SideEffectType.REDNESS,
        severity: 2,
        note: 'Ửng đỏ nhẹ sau bước đặc trị, hết sau khoảng 30 phút.',
      },
    ];
  }
  if (index === 1) {
    return [
      {
        type: SideEffectType.PEELING,
        severity: 1,
        note: 'Bong nhẹ quanh cánh mũi.',
      },
    ];
  }
  return [];
}

/** Consecutive COMPLETED days ending at the most recent seeded day. */
function trailingStreak(days: DemoDayPlan[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (!days[i].completed) break;
    streak += 1;
  }
  return streak;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
