import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
import { CommerceSettingKey } from '../commerce/enums';
import { AppConfigService } from '../config/config.service';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';

/** Minutes before the slot start under which a booking may no longer be created. */
export const DEFAULT_BOOKING_MIN_LEAD_TIME_MIN = 120;

export type BookingSettings = {
  /** Minutes a PENDING booking waits for expert confirm before auto-cancel. */
  confirmTimeoutMin: number;
  /** Minutes after scheduledAt a CONFIRMED booking may sit un-started before no-show cancel. */
  noShowGraceMin: number;
  /** Minimum minutes between booking creation and the slot start. */
  minLeadTimeMin: number;
};

/**
 * Admin-configurable booking deadlines, stored in commerce_settings and
 * falling back to the environment defaults when no row exists.
 */
@Injectable()
export class BookingSettingsService {
  constructor(
    @InjectRepository(CommerceSetting)
    private readonly settingRepository: Repository<CommerceSetting>,
    private readonly config: AppConfigService,
  ) {}

  async getSettings(): Promise<BookingSettings> {
    const { confirmTimeoutMin, noShowGraceMin } =
      this.config.bookingExpiryConfig;
    return {
      confirmTimeoutMin: await this.readInt(
        CommerceSettingKey.BOOKING_CONFIRM_TIMEOUT_MIN,
        confirmTimeoutMin,
        1,
      ),
      noShowGraceMin: await this.readInt(
        CommerceSettingKey.BOOKING_NO_SHOW_GRACE_MIN,
        noShowGraceMin,
        0,
      ),
      minLeadTimeMin: await this.readInt(
        CommerceSettingKey.BOOKING_MIN_LEAD_TIME_MIN,
        DEFAULT_BOOKING_MIN_LEAD_TIME_MIN,
        0,
      ),
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateBookingSettingsDto,
  ): Promise<BookingSettings> {
    if (dto.confirmTimeoutMin !== undefined) {
      await this.upsert(
        CommerceSettingKey.BOOKING_CONFIRM_TIMEOUT_MIN,
        dto.confirmTimeoutMin,
        userId,
      );
    }
    if (dto.noShowGraceMin !== undefined) {
      await this.upsert(
        CommerceSettingKey.BOOKING_NO_SHOW_GRACE_MIN,
        dto.noShowGraceMin,
        userId,
      );
    }
    if (dto.minLeadTimeMin !== undefined) {
      await this.upsert(
        CommerceSettingKey.BOOKING_MIN_LEAD_TIME_MIN,
        dto.minLeadTimeMin,
        userId,
      );
    }
    return this.getSettings();
  }

  private async readInt(
    key: CommerceSettingKey,
    fallback: number,
    min: number,
  ): Promise<number> {
    const setting = await this.settingRepository.findOneBy({ key });
    const parsed = Number.parseInt(setting?.value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < min) {
      return fallback;
    }
    return parsed;
  }

  private async upsert(
    key: CommerceSettingKey,
    value: number,
    userId: string,
  ): Promise<void> {
    let setting = await this.settingRepository.findOneBy({ key });
    if (!setting) {
      setting = this.settingRepository.create({
        key,
        value: String(value),
        updatedByUserId: userId,
      });
    } else {
      setting.value = String(value);
      setting.updatedByUserId = userId;
    }
    await this.settingRepository.save(setting);
  }
}
