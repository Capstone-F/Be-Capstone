export type TimeWindow = {
  startAt: Date;
  endAt: Date;
};

export type DateRange = {
  from: Date;
  to: Date;
};

/** Monday 00:00:00 UTC through Sunday 23:59:59.999 UTC of the week containing `date`. */
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

/** First day 00:00:00 UTC through last day 23:59:59.999 UTC of the month containing `date`. */
export function getMonthRange(date: Date): DateRange {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { from, to };
}

/** Inclusive list of UTC calendar dates from `from` through `to`. */
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

/** Build a UTC timestamp for a calendar date at the given hour. */
export function dateAtHour(date: Date, hour: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      0,
      0,
      0,
    ),
  );
}

/**
 * Generate candidate session slots for one availability block on a given day.
 * Starts every hour H where H + sessionLengthHours <= endHour.
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
