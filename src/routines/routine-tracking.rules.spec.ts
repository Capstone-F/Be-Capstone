import {
  DayHistoryStatus,
  RoutinePeriod,
  SessionState,
  StepCompletionStatus,
  StockWarningLevel,
} from './enums';
import {
  aggregateSessionState,
  averageCompletionRate,
  computeCurrentStreak,
  computeProgress,
  defaultPeriodForNow,
  deriveDayHistoryStatus,
  deriveSessionState,
  eachDateInclusive,
  estimateVariantStock,
  getVnDateParts,
  parseMlVolume,
  progressFromStatuses,
  shiftDate,
} from './routine-tracking.rules';

describe('routine-tracking.rules', () => {
  describe('getVnDateParts / defaultPeriodForNow', () => {
    it('uses Asia/Ho_Chi_Minh calendar date', () => {
      // 2026-07-21 17:00 UTC = 2026-07-22 00:00 VN
      const parts = getVnDateParts(new Date('2026-07-21T17:00:00.000Z'));
      expect(parts.date).toBe('2026-07-22');
      expect(parts.hour).toBe(0);
    });

    it('defaults to MORNING before 14:00 VN', () => {
      // 2026-07-22 06:00 UTC = 13:00 VN
      expect(defaultPeriodForNow(new Date('2026-07-22T06:00:00.000Z'))).toBe(
        RoutinePeriod.MORNING,
      );
    });

    it('defaults to EVENING at/after 14:00 VN', () => {
      // 2026-07-22 07:00 UTC = 14:00 VN
      expect(defaultPeriodForNow(new Date('2026-07-22T07:00:00.000Z'))).toBe(
        RoutinePeriod.EVENING,
      );
    });
  });

  describe('progress', () => {
    it('computes completionRate from completed/total only', () => {
      expect(computeProgress(4, 3, 1)).toEqual({
        completedCount: 3,
        skippedCount: 1,
        totalCount: 4,
        completionRate: 75,
      });
    });

    it('returns 0 rate when total is 0', () => {
      expect(computeProgress(0, 0, 0).completionRate).toBe(0);
    });

    it('counts statuses via progressFromStatuses', () => {
      expect(
        progressFromStatuses([
          StepCompletionStatus.COMPLETED,
          StepCompletionStatus.SKIPPED,
          null,
          undefined,
        ]),
      ).toEqual({
        completedCount: 1,
        skippedCount: 1,
        totalCount: 4,
        completionRate: 25,
      });
    });
  });

  describe('deriveSessionState', () => {
    it('NOT_STARTED when nothing acted today', () => {
      expect(
        deriveSessionState({
          totalCount: 4,
          actedCount: 0,
          sessionDate: '2026-07-22',
          today: '2026-07-22',
        }),
      ).toBe(SessionState.NOT_STARTED);
    });

    it('MISSED when nothing acted on a past day', () => {
      expect(
        deriveSessionState({
          totalCount: 4,
          actedCount: 0,
          sessionDate: '2026-07-21',
          today: '2026-07-22',
        }),
      ).toBe(SessionState.MISSED);
    });

    it('IN_PROGRESS when partially acted', () => {
      expect(
        deriveSessionState({
          totalCount: 4,
          actedCount: 2,
          sessionDate: '2026-07-22',
          today: '2026-07-22',
        }),
      ).toBe(SessionState.IN_PROGRESS);
    });

    it('COMPLETED when all steps acted including skips', () => {
      expect(
        deriveSessionState({
          totalCount: 4,
          actedCount: 4,
          sessionDate: '2026-07-22',
          today: '2026-07-22',
        }),
      ).toBe(SessionState.COMPLETED);
    });
  });

  describe('aggregateSessionState', () => {
    it('returns EMPTY for no routines', () => {
      expect(aggregateSessionState([])).toBe(SessionState.EMPTY);
    });

    it('aggregates mixed states to IN_PROGRESS', () => {
      expect(
        aggregateSessionState([
          SessionState.COMPLETED,
          SessionState.NOT_STARTED,
        ]),
      ).toBe(SessionState.IN_PROGRESS);
    });
  });

  describe('deriveDayHistoryStatus', () => {
    it('returns null before routine activation', () => {
      expect(
        deriveDayHistoryStatus({
          date: '2026-07-01',
          today: '2026-07-22',
          routineActiveFrom: '2026-07-10',
          periodTotals: [2, 2],
          periodActed: [0, 0],
        }),
      ).toBeNull();
    });

    it('marks past idle days as MISSED', () => {
      expect(
        deriveDayHistoryStatus({
          date: '2026-07-21',
          today: '2026-07-22',
          routineActiveFrom: '2026-07-01',
          periodTotals: [2, 2],
          periodActed: [0, 0],
        }),
      ).toBe(DayHistoryStatus.MISSED);
    });

    it('marks today idle as NOT_STARTED', () => {
      expect(
        deriveDayHistoryStatus({
          date: '2026-07-22',
          today: '2026-07-22',
          routineActiveFrom: '2026-07-01',
          periodTotals: [2, 2],
          periodActed: [0, 0],
        }),
      ).toBe(DayHistoryStatus.NOT_STARTED);
    });

    it('marks partial day as PARTIAL', () => {
      expect(
        deriveDayHistoryStatus({
          date: '2026-07-21',
          today: '2026-07-22',
          routineActiveFrom: '2026-07-01',
          periodTotals: [2, 2],
          periodActed: [2, 0],
        }),
      ).toBe(DayHistoryStatus.PARTIAL);
    });

    it('marks day COMPLETED when every period with steps is fully acted', () => {
      expect(
        deriveDayHistoryStatus({
          date: '2026-07-21',
          today: '2026-07-22',
          routineActiveFrom: '2026-07-01',
          periodTotals: [2, 0],
          periodActed: [2, 0],
        }),
      ).toBe(DayHistoryStatus.COMPLETED);
    });
  });

  describe('streak / dates', () => {
    it('enumerates inclusive date range', () => {
      expect(eachDateInclusive('2026-07-20', '2026-07-22')).toEqual([
        '2026-07-20',
        '2026-07-21',
        '2026-07-22',
      ]);
    });

    it('computes streak ending yesterday when today incomplete', () => {
      const streak = computeCurrentStreak(
        [
          { date: '2026-07-20', status: DayHistoryStatus.COMPLETED },
          { date: '2026-07-21', status: DayHistoryStatus.COMPLETED },
          { date: '2026-07-22', status: DayHistoryStatus.NOT_STARTED },
        ],
        '2026-07-22',
      );
      expect(streak).toBe(2);
    });

    it('includes today when today is COMPLETED', () => {
      const streak = computeCurrentStreak(
        [
          { date: '2026-07-21', status: DayHistoryStatus.COMPLETED },
          { date: '2026-07-22', status: DayHistoryStatus.COMPLETED },
        ],
        '2026-07-22',
      );
      expect(streak).toBe(2);
    });

    it('averages rates', () => {
      expect(averageCompletionRate([100, 50])).toBe(75);
      expect(averageCompletionRate([])).toBe(0);
    });

    it('shifts dates', () => {
      expect(shiftDate('2026-07-01', -1)).toBe('2026-06-30');
    });
  });

  describe('parseMlVolume', () => {
    it('parses ml volumes', () => {
      expect(parseMlVolume('30ml')).toBe(30);
      expect(parseMlVolume('236 mL')).toBe(236);
      expect(parseMlVolume('1.5ml')).toBe(1.5);
    });

    it('rejects non-ml or empty', () => {
      expect(parseMlVolume('454g')).toBeNull();
      expect(parseMlVolume(null)).toBeNull();
      expect(parseMlVolume('')).toBeNull();
    });
  });

  describe('estimateVariantStock', () => {
    it('returns null when volume missing, usage not trackable, or dailyUsage invalid', () => {
      expect(
        estimateVariantStock({
          bottleMl: null,
          purchasedQty: 1,
          usedMl: 0,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({ warning: null, remainingMl: null, daysLeft: null });

      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 0,
          dailyUsageMl: 1,
          canTrackUsage: false,
        }),
      ).toEqual({ warning: null, remainingMl: null, daysLeft: null });

      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 0,
          dailyUsageMl: 0,
          canTrackUsage: true,
        }),
      ).toEqual({ warning: null, remainingMl: null, daysLeft: null });
    });

    it('returns no warning when daysLeft > 5', () => {
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 5,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({ warning: null, remainingMl: 25, daysLeft: 25 });

      // 6ml left at 1ml/day → 6 days → not LOW
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 24,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({ warning: null, remainingMl: 6, daysLeft: 6 });
    });

    it('returns LOW when daysLeft ≤ 5', () => {
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 25,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.LOW,
        remainingMl: 5,
        daysLeft: 5,
      });

      // Less than one full day of use left
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 29.5,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.LOW,
        remainingMl: 0.5,
        daysLeft: 0,
      });
    });

    it('returns EMPTY when depleted', () => {
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 30,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.EMPTY,
        remainingMl: 0,
        daysLeft: 0,
      });
    });

    it('uses shared bottle remaining for AM+PM total usage', () => {
      // 30ml bottle, AM 1 + PM 1 = 2ml/day; 20 used → 10 remaining → 5 days → LOW
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 20,
          dailyUsageMl: 2,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.LOW,
        remainingMl: 10,
        daysLeft: 5,
      });

      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 25,
          dailyUsageMl: 2,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.LOW,
        remainingMl: 5,
        daysLeft: 2,
      });
    });

    it('clears warning after repurchase increases purchased qty', () => {
      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 1,
          usedMl: 30,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({
        warning: StockWarningLevel.EMPTY,
        remainingMl: 0,
        daysLeft: 0,
      });

      expect(
        estimateVariantStock({
          bottleMl: 30,
          purchasedQty: 2,
          usedMl: 30,
          dailyUsageMl: 1,
          canTrackUsage: true,
        }),
      ).toEqual({ warning: null, remainingMl: 30, daysLeft: 30 });
    });
  });
});
