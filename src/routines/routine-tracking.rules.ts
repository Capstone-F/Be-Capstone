import {
  DayHistoryStatus,
  RoutinePeriod,
  SessionState,
  StepCompletionStatus,
  StepSessionStatus,
  StockWarningLevel,
} from './enums';

export const ROUTINE_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Local hour (0–23) at which default period switches to EVENING. */
export const PERIOD_SWITCH_HOUR = 14;
/** Remaining ratio at or below this triggers LOW stock warning. */
export const LOW_STOCK_RATIO = 0.2;

export type ProgressCounts = {
  completedCount: number;
  skippedCount: number;
  totalCount: number;
  completionRate: number;
};

export function getVnDateParts(now: Date = new Date()): {
  date: string;
  hour: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ROUTINE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const hourRaw = lookup('hour');
  const hour = Number(hourRaw === '24' ? '0' : hourRaw);

  return {
    date: `${year}-${month}-${day}`,
    hour: Number.isFinite(hour) ? hour : 0,
  };
}

export function getVnToday(now: Date = new Date()): string {
  return getVnDateParts(now).date;
}

export function defaultPeriodForNow(now: Date = new Date()): RoutinePeriod {
  const { hour } = getVnDateParts(now);
  return hour < PERIOD_SWITCH_HOUR
    ? RoutinePeriod.MORNING
    : RoutinePeriod.EVENING;
}

export function toDateString(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  // TypeORM date columns may arrive as Date at UTC midnight
  const iso = value.toISOString();
  return iso.slice(0, 10);
}

export function vnDateFromUtcDate(value: Date): string {
  return getVnDateParts(value).date;
}

export function computeProgress(
  totalCount: number,
  completedCount: number,
  skippedCount: number,
): ProgressCounts {
  const completionRate =
    totalCount <= 0
      ? 0
      : Math.round((completedCount / totalCount) * 10000) / 100;
  return {
    completedCount,
    skippedCount,
    totalCount,
    completionRate,
  };
}

export function progressFromStatuses(
  statuses: Array<StepCompletionStatus | StepSessionStatus | null | undefined>,
): ProgressCounts {
  let completedCount = 0;
  let skippedCount = 0;
  for (const status of statuses) {
    if (
      status === StepCompletionStatus.COMPLETED ||
      status === StepSessionStatus.COMPLETED
    ) {
      completedCount += 1;
    } else if (
      status === StepCompletionStatus.SKIPPED ||
      status === StepSessionStatus.SKIPPED
    ) {
      skippedCount += 1;
    }
  }
  return computeProgress(statuses.length, completedCount, skippedCount);
}

/**
 * Session is COMPLETED when every step is COMPLETED or SKIPPED (skip counts as acted).
 * MISSED only applies to past dates with zero actions.
 */
export function deriveSessionState(params: {
  totalCount: number;
  actedCount: number;
  sessionDate: string;
  today: string;
}): SessionState {
  const { totalCount, actedCount, sessionDate, today } = params;
  if (totalCount <= 0) {
    return SessionState.NOT_STARTED;
  }
  if (actedCount <= 0) {
    if (sessionDate < today) {
      return SessionState.MISSED;
    }
    return SessionState.NOT_STARTED;
  }
  if (actedCount >= totalCount) {
    return SessionState.COMPLETED;
  }
  return SessionState.IN_PROGRESS;
}

export function aggregateSessionState(states: SessionState[]): SessionState {
  if (states.length === 0) {
    return SessionState.EMPTY;
  }
  if (states.every((s) => s === SessionState.COMPLETED)) {
    return SessionState.COMPLETED;
  }
  if (states.every((s) => s === SessionState.NOT_STARTED)) {
    return SessionState.NOT_STARTED;
  }
  if (states.every((s) => s === SessionState.MISSED)) {
    return SessionState.MISSED;
  }
  return SessionState.IN_PROGRESS;
}

/**
 * Day-level status across periods that have steps.
 * A day is COMPLETED only when every period that has steps is fully acted.
 */
export function deriveDayHistoryStatus(params: {
  date: string;
  today: string;
  routineActiveFrom: string;
  periodTotals: number[];
  periodActed: number[];
}): DayHistoryStatus | null {
  const { date, today, routineActiveFrom, periodTotals, periodActed } = params;

  if (date < routineActiveFrom) {
    return null;
  }

  const total = periodTotals.reduce((a, b) => a + b, 0);
  const acted = periodActed.reduce((a, b) => a + b, 0);

  if (total <= 0) {
    return null;
  }

  if (acted <= 0) {
    if (date > today) {
      return DayHistoryStatus.NOT_STARTED;
    }
    if (date === today) {
      return DayHistoryStatus.NOT_STARTED;
    }
    return DayHistoryStatus.MISSED;
  }

  // All periods with steps must be fully acted for day COMPLETED
  const allPeriodsDone = periodTotals.every(
    (t, i) => t === 0 || periodActed[i] >= t,
  );
  if (allPeriodsDone) {
    return DayHistoryStatus.COMPLETED;
  }
  return DayHistoryStatus.PARTIAL;
}

export function eachDateInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Current streak: consecutive COMPLETED days ending at today if today is
 * COMPLETED, otherwise ending at yesterday.
 */
export function computeCurrentStreak(
  days: Array<{ date: string; status: DayHistoryStatus }>,
  today: string,
): number {
  const byDate = new Map(days.map((d) => [d.date, d.status]));
  const yesterday = shiftDate(today, -1);

  let start = today;
  if (byDate.get(today) !== DayHistoryStatus.COMPLETED) {
    start = yesterday;
  }

  let streak = 0;
  let cursor = start;
  while (byDate.get(cursor) === DayHistoryStatus.COMPLETED) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function averageCompletionRate(rates: number[]): number {
  if (rates.length === 0) return 0;
  const sum = rates.reduce((a, b) => a + b, 0);
  return Math.round((sum / rates.length) * 100) / 100;
}

/**
 * Parse catalog volume strings like "30ml" / "30 mL".
 * Non-ml units (e.g. "454g") return null.
 */
export function parseMlVolume(
  volume: string | null | undefined,
): number | null {
  if (!volume) return null;
  const match = /^([\d.]+)\s*ml$/i.exec(volume.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type StepStockEstimate = {
  warning: StockWarningLevel | null;
  remainingMl: number | null;
};

/**
 * On-the-fly remaining volume for a product variant (shared across AM/PM steps).
 * Same productVariantId → same warning / remainingMl on every linked step.
 */
export function estimateVariantStock(params: {
  bottleMl: number | null;
  purchasedQty: number;
  /** Total ml used across all routine steps for this variant. */
  usedMl: number;
  /** True when at least one step has a measurable amountMl. */
  canTrackUsage: boolean;
}): StepStockEstimate {
  const { bottleMl, purchasedQty, usedMl, canTrackUsage } = params;

  if (bottleMl == null || purchasedQty <= 0 || !canTrackUsage) {
    return { warning: null, remainingMl: null };
  }

  const purchasedMl = bottleMl * purchasedQty;
  const remainingMl = Math.max(
    0,
    Math.round((purchasedMl - usedMl) * 100) / 100,
  );
  const remainingRatio = purchasedMl > 0 ? remainingMl / purchasedMl : 0;

  if (remainingMl <= 0) {
    return { warning: StockWarningLevel.EMPTY, remainingMl: 0 };
  }
  if (remainingRatio <= LOW_STOCK_RATIO) {
    return { warning: StockWarningLevel.LOW, remainingMl };
  }
  return { warning: null, remainingMl };
}
