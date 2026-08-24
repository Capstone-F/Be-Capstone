import { Repository } from 'typeorm';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
import { CommerceSettingKey } from '../commerce/enums';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import {
  DEFAULT_EXPERT_CANCEL_LIMIT,
  DEFAULT_EXPERT_CANCEL_WINDOW_DAYS,
  DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
  DEFAULT_EXPERT_NO_SHOW_WEIGHT,
  ExpertCancellationStatsService,
} from './expert-cancellation-stats.service';

type RawRow = {
  expertId: string;
  expertName: string | null;
  clinicId: string | null;
  clinicName: string | null;
  isActive: boolean;
  assignedCount: number | string;
  expertCancelCount: number | string;
  lateCancelCount: number | string;
  noShowCount: number | string;
};

const makeRow = (overrides: Partial<RawRow> = {}): RawRow => ({
  expertId: 'expert-1',
  expertName: 'Dr. Expert',
  clinicId: 'clinic-1',
  clinicName: 'GlowScan Clinic',
  isActive: true,
  assignedCount: 10,
  expertCancelCount: 0,
  lateCancelCount: 0,
  noShowCount: 0,
  ...overrides,
});

describe('ExpertCancellationStatsService', () => {
  afterEach(() => jest.clearAllMocks());

  function makeService(
    options: {
      settings?: Partial<Record<string, string>>;
      rawRows?: RawRow[];
    } = {},
  ) {
    const settingRepo = {
      findOneBy: jest.fn(({ key }: { key: CommerceSettingKey }) => {
        const value = options.settings?.[key];
        return Promise.resolve(
          value !== undefined ? ({ key, value } as CommerceSetting) : null,
        );
      }),
      create: jest.fn((input: Partial<CommerceSetting>) => input),
      save: jest.fn((input: CommerceSetting) => Promise.resolve(input)),
    } as unknown as Repository<CommerceSetting>;

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(options.rawRows ?? []),
    };

    const consultationRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<ConsultationRequest>;

    const service = new ExpertCancellationStatsService(
      consultationRepo,
      settingRepo,
    );
    return { service, settingRepo, qb };
  }

  describe('getPolicy', () => {
    it('falls back to defaults when no settings rows exist', async () => {
      const { service } = makeService();

      await expect(service.getPolicy()).resolves.toEqual({
        cancelLimit: DEFAULT_EXPERT_CANCEL_LIMIT,
        windowDays: DEFAULT_EXPERT_CANCEL_WINDOW_DAYS,
        noShowWeight: DEFAULT_EXPERT_NO_SHOW_WEIGHT,
        lateCancelThresholdMin: DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
      });
    });

    it('reads stored overrides', async () => {
      const { service } = makeService({
        settings: {
          [CommerceSettingKey.EXPERT_CANCEL_LIMIT_30D]: '5',
          [CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS]: '14',
          [CommerceSettingKey.EXPERT_NO_SHOW_WEIGHT]: '3',
          [CommerceSettingKey.EXPERT_LATE_CANCEL_THRESHOLD_MIN]: '120',
        },
      });

      await expect(service.getPolicy()).resolves.toEqual({
        cancelLimit: 5,
        windowDays: 14,
        noShowWeight: 3,
        lateCancelThresholdMin: 120,
      });
    });

    it('ignores invalid or below-minimum stored values', async () => {
      const { service } = makeService({
        settings: {
          [CommerceSettingKey.EXPERT_CANCEL_LIMIT_30D]: 'abc',
          [CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS]: '0',
          [CommerceSettingKey.EXPERT_NO_SHOW_WEIGHT]: '-1',
        },
      });

      await expect(service.getPolicy()).resolves.toEqual({
        cancelLimit: DEFAULT_EXPERT_CANCEL_LIMIT,
        windowDays: DEFAULT_EXPERT_CANCEL_WINDOW_DAYS,
        noShowWeight: DEFAULT_EXPERT_NO_SHOW_WEIGHT,
        lateCancelThresholdMin: DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
      });
    });
  });

  describe('updatePolicy', () => {
    it('upserts the provided keys and returns the merged policy', async () => {
      const { service, settingRepo } = makeService();

      const saved: CommerceSetting[] = [];
      (settingRepo.save as jest.Mock).mockImplementation(
        (input: CommerceSetting) => {
          saved.push(input);
          return Promise.resolve(input);
        },
      );

      await service.updatePolicy('admin-1', { cancelLimit: 4 });

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        key: CommerceSettingKey.EXPERT_CANCEL_LIMIT_30D,
        value: '4',
        updatedByUserId: 'admin-1',
      });
    });

    it('updates an existing row instead of creating a duplicate', async () => {
      const existing = {
        key: CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS,
        value: '30',
        updatedByUserId: null,
      } as CommerceSetting;
      const { service, settingRepo } = makeService({
        settings: { [CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS]: '30' },
      });
      (settingRepo.findOneBy as jest.Mock).mockImplementation(
        ({ key }: { key: CommerceSettingKey }) =>
          Promise.resolve(
            key === CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS
              ? existing
              : null,
          ),
      );

      await service.updatePolicy('admin-1', { windowDays: 7 });

      expect(settingRepo.create).not.toHaveBeenCalled();
      expect(existing.value).toBe('7');
      expect(existing.updatedByUserId).toBe('admin-1');
    });
  });

  describe('getStats', () => {
    it('computes cancel rate, flags experts at the limit, and sorts descending', async () => {
      const { service } = makeService({
        rawRows: [
          makeRow({
            expertId: 'expert-quiet',
            assignedCount: 8,
            expertCancelCount: 1,
          }),
          makeRow({
            expertId: 'expert-abuser',
            assignedCount: '10',
            expertCancelCount: '4',
            noShowCount: '2',
          }),
        ],
      });

      const result = await service.getStats();

      expect(result.windowDays).toBe(DEFAULT_EXPERT_CANCEL_WINDOW_DAYS);
      expect(result.cancelLimit).toBe(DEFAULT_EXPERT_CANCEL_LIMIT);
      expect(result.noShowWeight).toBe(DEFAULT_EXPERT_NO_SHOW_WEIGHT);
      expect(result.totalExperts).toBe(2);
      expect(result.flaggedCount).toBe(1);
      expect(result.items.map((i) => i.expertId)).toEqual([
        'expert-abuser',
        'expert-quiet',
      ]);
      // 4 ordinary cancels + 2 no-shows × weight 2 = 8.
      expect(result.items[0]).toMatchObject({
        expertCancelCount: 4,
        noShowCount: 2,
        violationScore: 8,
        cancelRate: 0.4,
        exceedsLimit: true,
      });
      expect(result.items[1]).toMatchObject({
        expertCancelCount: 1,
        violationScore: 1,
        cancelRate: 0.125,
        exceedsLimit: false,
      });
    });

    it('weights late cancels like no-shows when scoring against the limit', async () => {
      const { service } = makeService({
        rawRows: [
          makeRow({
            expertId: 'expert-late',
            assignedCount: 10,
            expertCancelCount: 2,
            lateCancelCount: 1,
          }),
        ],
      });

      const result = await service.getStats();

      // 1 ordinary cancel + 1 late cancel × weight 2 = 3 → hits the limit.
      expect(result.items[0]).toMatchObject({
        expertCancelCount: 2,
        lateCancelCount: 1,
        violationScore: 3,
        exceedsLimit: true,
      });
      expect(result.flaggedCount).toBe(1);
    });

    it('returns a null cancel rate when nothing was assigned in the window', async () => {
      const { service } = makeService({
        rawRows: [
          makeRow({ assignedCount: 0, expertCancelCount: 3, noShowCount: 0 }),
        ],
      });

      const result = await service.getStats();

      expect(result.items[0].cancelRate).toBeNull();
      expect(result.items[0].exceedsLimit).toBe(true);
    });

    it('scopes to a clinic and honours the days override', async () => {
      const { service, qb } = makeService({ rawRows: [] });

      const before = Date.now();
      const result = await service.getStats({ clinicId: 'clinic-9', days: 7 });

      expect(result.windowDays).toBe(7);
      expect(qb.andWhere).toHaveBeenCalledWith('expert.clinicId = :clinicId', {
        clinicId: 'clinic-9',
      });
      const from = new Date(result.from).getTime();
      expect(before - from).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
      expect(before - from).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
    });
  });
});
