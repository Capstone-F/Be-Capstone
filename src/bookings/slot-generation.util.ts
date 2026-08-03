export type TimeWindow = {
  startAt: Date;
  endAt: Date;
};

export type DateRange = {
  from: Date;
  to: Date;
};

/** Vietnam / Indochina Time — fixed UTC+7, no DST. */
export const BOOKING_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VN_UTC_OFFSET_HOURS = 7;
const VN_OFFSET_MS = VN_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/** Inclusive start / exclusive end of bookable business hours (GMT+7). */
export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 20;

/** Shift an absolute instant into a Date whose UTC fields equal VN local fields. */
function asVnLocal(instant: Date): Date {
  return new Date(instant.getTime() + VN_OFFSET_MS);
}

/** Monday 00:00 through Sunday 23:59:59.999 of the Vietnam calendar week containing `date`. */
export function getWeekRange(date: Date): DateRange {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = new Date(d);
  from.setUTCDate(d.getUTCDate() + diffToMonday);

  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

/** First day 00:00 through last day 23:59:59.999 of the Vietnam calendar month containing `date`. */
export function getMonthRange(date: Date): DateRange {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { from, to };
}

/** Inclusive list of Vietnam calendar dates from `from` through `to`. */
export function enumerateDates(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Absolute timestamp for a Vietnam calendar date at the given local hour (GMT+7).
 * `date` is a date-only marker (UTC midnight of YYYY-MM-DD = VN calendar date).
 */
export function dateAtHour(date: Date, hour: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour - VN_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}

/** Vietnam local hour (0–23) for an absolute instant. */
export function getVnHour(instant: Date): number {
  return asVnLocal(instant).getUTCHours();
}

/** Vietnam calendar date-only marker (UTC midnight of YYYY-MM-DD) for an instant. */
export function vnCalendarDate(instant: Date): Date {
  const local = asVnLocal(instant);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

/** Vietnam day-of-week (0 = Sunday .. 6 = Saturday) for an absolute instant. */
export function vnDayOfWeek(instant: Date): number {
  return asVnLocal(instant).getUTCDay();
}

/** Today as a Vietnam calendar date-only marker. */
export function todayVn(now: Date = new Date()): Date {
  return vnCalendarDate(now);
}

/** Format an absolute instant as ISO-8601 with a fixed +07:00 offset. */
export function formatVnIso(instant: Date): string {
  const local = asVnLocal(instant);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  const h = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  const s = String(local.getUTCSeconds()).padStart(2, '0');
  const ms = String(local.getUTCMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+07:00`;
}

/**
 * Intersect an availability window with business hours [9, 20).
 * Returns null when the intersection is empty.
 */
export function clampToBusinessHours(
  startHour: number,
  endHour: number,
): { startHour: number; endHour: number } | null {
  const start = Math.max(startHour, BUSINESS_START_HOUR);
  const end = Math.min(endHour, BUSINESS_END_HOUR);
  if (end <= start) {
    return null;
  }
  return { startHour: start, endHour: end };
}

/**
 * Generate candidate session slots for one availability block on a given day.
 * Starts every hour H where H + sessionLengthHours <= endHour.
 * Hours are Vietnam local (GMT+7).
 */
export function generateSlotsForBlock(
  date: Date,
  startHour: number,
  endHour: number,
  sessionLengthHours: number,
): TimeWindow[] {
  const slots: TimeWindow[] = [];
  for (let h = startHour; h + sessionLengthHours <= endHour; h++) {
    const startAt = dateAtHour(date, h);
    const endAt = dateAtHour(date, h + sessionLengthHours);
    slots.push({ startAt, endAt });
  }
  return slots;
}

/** True when [a.startAt, a.endAt) intersects [b.startAt, b.endAt). Adjacent windows do not overlap. */
export function slotsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
