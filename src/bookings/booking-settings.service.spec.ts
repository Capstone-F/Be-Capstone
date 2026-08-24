import { Repository } from 'typeorm';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
import { CommerceSettingKey } from '../commerce/enums';
import { AppConfigService } from '../config/config.service';
import {
  BookingSettingsService,
  DEFAULT_BOOKING_MIN_LEAD_TIME_MIN,
} from './booking-settings.service';

function makeService(rows: Partial<Record<CommerceSettingKey, string>> = {}) {
  const saved: CommerceSetting[] = [];
  const settingRepo = {
    findOneBy: jest.fn(({ key }: { key: CommerceSettingKey }) => {
      const value = rows[key];
      return Promise.resolve(
        value === undefined ? null : ({ key, value } as CommerceSetting),
      );
    }),
    create: jest.fn(
      (data: Partial<CommerceSetting>) => data as CommerceSetting,
    ),
    save: jest.fn((row: CommerceSetting) => {
      saved.push(row);
      rows[row.key] = row.value;
      return Promise.resolve(row);
    }),
  } as unknown as Repository<CommerceSetting>;

  const config = {
    bookingExpiryConfig: {
      cronEnabled: true,
      tickCron: '0 * * * * *',
      confirmTimeoutMin: 1440,
      noShowGraceMin: 15,
      batchSize: 20,
    },
  } as unknown as AppConfigService;

  const service = new BookingSettingsService(settingRepo, config);
  return { service, settingRepo, saved };
}

describe('BookingSettingsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should fall back to env defaults when no rows exist', async () => {
    const { service } = makeService();

    await expect(service.getSettings()).resolves.toEqual({
      confirmTimeoutMin: 1440,
      noShowGraceMin: 15,
      minLeadTimeMin: DEFAULT_BOOKING_MIN_LEAD_TIME_MIN,
    });
  });

  it('should prefer stored overrides over env defaults', async () => {
    const { service } = makeService({
      [CommerceSettingKey.BOOKING_CONFIRM_TIMEOUT_MIN]: '720',
      [CommerceSettingKey.BOOKING_NO_SHOW_GRACE_MIN]: '30',
      [CommerceSettingKey.BOOKING_MIN_LEAD_TIME_MIN]: '60',
    });

    await expect(service.getSettings()).resolves.toEqual({
      confirmTimeoutMin: 720,
      noShowGraceMin: 30,
      minLeadTimeMin: 60,
    });
  });

  it('should ignore malformed or out-of-range stored values', async () => {
    const { service } = makeService({
      [CommerceSettingKey.BOOKING_CONFIRM_TIMEOUT_MIN]: 'abc',
      [CommerceSettingKey.BOOKING_NO_SHOW_GRACE_MIN]: '-5',
    });

    const settings = await service.getSettings();
    expect(settings.confirmTimeoutMin).toBe(1440);
    expect(settings.noShowGraceMin).toBe(15);
  });

  it('should upsert only the provided fields and stamp the admin user', async () => {
    const { service, saved } = makeService();

    const settings = await service.updateSettings('admin-1', {
      noShowGraceMin: 20,
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      key: CommerceSettingKey.BOOKING_NO_SHOW_GRACE_MIN,
      value: '20',
      updatedByUserId: 'admin-1',
    });
    expect(settings.noShowGraceMin).toBe(20);
    expect(settings.confirmTimeoutMin).toBe(1440);
  });

  it('should overwrite an existing row on update', async () => {
    const { service, saved } = makeService({
      [CommerceSettingKey.BOOKING_MIN_LEAD_TIME_MIN]: '120',
    });

    const settings = await service.updateSettings('admin-1', {
      minLeadTimeMin: 0,
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].value).toBe('0');
    // 0 is a valid stored value: it disables the lead-time check.
    expect(settings.minLeadTimeMin).toBe(0);
  });
});
