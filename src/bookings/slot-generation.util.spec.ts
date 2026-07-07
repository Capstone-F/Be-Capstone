import {
  dateAtHour,
  enumerateDates,
  generateSlotsForBlock,
  getMonthRange,
  getWeekRange,
  slotsOverlap,
} from './slot-generation.util';

describe('slot-generation.util', () => {
  describe('getWeekRange', () => {
    it('should return Monday through Sunday for a mid-week date', () => {
      const { from, to } = getWeekRange(new Date('2026-07-08T12:00:00.000Z')); // Wednesday
      expect(from.toISOString()).toBe('2026-07-06T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-07-12T23:59:59.999Z');
    });

    it('should treat Sunday as end of the same week', () => {
      const { from, to } = getWeekRange(new Date('2026-07-12T12:00:00.000Z')); // Sunday
      expect(from.toISOString()).toBe('2026-07-06T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-07-12T23:59:59.999Z');
    });
  });

  describe('getMonthRange', () => {
    it('should return first through last day of the month', () => {
      const { from, to } = getMonthRange(new Date('2026-07-15T12:00:00.000Z'));
      expect(from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-07-31T23:59:59.999Z');
    });
  });

  describe('enumerateDates', () => {
    it('should list each calendar day inclusively', () => {
      const from = new Date('2026-07-06T00:00:00.000Z');
      const to = new Date('2026-07-08T23:59:59.999Z');
      const dates = enumerateDates(from, to);
      expect(dates).toHaveLength(3);
      expect(dates[0].toISOString()).toBe('2026-07-06T00:00:00.000Z');
      expect(dates[2].toISOString()).toBe('2026-07-08T00:00:00.000Z');
    });
  });

  describe('generateSlotsForBlock', () => {
    const date = new Date('2026-07-07T00:00:00.000Z');

    it('should emit hourly starts when session length is 1', () => {
      const slots = generateSlotsForBlock(date, 9, 18, 1);
      expect(slots).toHaveLength(9);
      expect(slots[0].startAt).toEqual(dateAtHour(date, 9));
      expect(slots[0].endAt).toEqual(dateAtHour(date, 10));
      expect(slots[8].startAt).toEqual(dateAtHour(date, 17));
      expect(slots[8].endAt).toEqual(dateAtHour(date, 18));
    });

    it('should emit hourly starts when session length is 2', () => {
      const slots = generateSlotsForBlock(date, 9, 18, 2);
      expect(slots).toHaveLength(8);
      expect(slots[0].startAt).toEqual(dateAtHour(date, 9));
      expect(slots[0].endAt).toEqual(dateAtHour(date, 11));
      expect(slots[7].startAt).toEqual(dateAtHour(date, 16));
      expect(slots[7].endAt).toEqual(dateAtHour(date, 18));
    });

    it('should drop start 17 when session length 2 exceeds endHour 18', () => {
      const slots = generateSlotsForBlock(date, 9, 18, 2);
      const starts = slots.map((s) => s.startAt.getUTCHours());
      expect(starts).not.toContain(17);
    });

    it('should generate slots independently per block', () => {
      const morning = generateSlotsForBlock(date, 9, 12, 1);
      const afternoon = generateSlotsForBlock(date, 13, 18, 1);
      expect(morning).toHaveLength(3);
      expect(afternoon).toHaveLength(5);
    });
  });

  describe('slotsOverlap', () => {
    const base = new Date('2026-07-07T00:00:00.000Z');

    it('should detect partial overlap', () => {
      const a = {
        startAt: dateAtHour(base, 9),
        endAt: dateAtHour(base, 11),
      };
      const b = {
        startAt: dateAtHour(base, 10),
        endAt: dateAtHour(base, 12),
      };
      expect(slotsOverlap(a, b)).toBe(true);
    });

    it('should not treat adjacent windows as overlapping', () => {
      const a = {
        startAt: dateAtHour(base, 9),
        endAt: dateAtHour(base, 10),
      };
      const b = {
        startAt: dateAtHour(base, 10),
        endAt: dateAtHour(base, 11),
      };
      expect(slotsOverlap(a, b)).toBe(false);
    });

    it('should detect containment', () => {
      const outer = {
        startAt: dateAtHour(base, 9),
        endAt: dateAtHour(base, 12),
      };
      const inner = {
        startAt: dateAtHour(base, 10),
        endAt: dateAtHour(base, 11),
      };
      expect(slotsOverlap(outer, inner)).toBe(true);
    });
  });
});
