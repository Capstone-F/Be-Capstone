import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
import { CommerceSettingKey } from '../commerce/enums';
import { AppConfigService } from '../config/config.service';
import {
  DEFAULT_BOOKING_MIN_LEAD_TIME_MIN,
  DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
  lateCancelLeadTimeWarning,
} from './booking-policy-conflicts';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';

export { DEFAULT_BOOKING_MIN_LEAD_TIME_MIN } from './booking-policy-conflicts';

export type BookingSettings = {
  /** Minutes a PENDING booking waits for expert confirm before auto-cancel. */
  confirmTimeoutMin: number;
  /** Minutes after scheduledAt a CONFIRMED booking may sit un-started before no-show cancel. */
  noShowGraceMin: number;
  /** Minimum minutes between booking creation and the slot start. */
  minLeadTimeMin: number;
  /** Cross-key conflict notes; only set on the admin endpoints. */
  warnings?: string[];
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

  /** getSettings plus cross-key conflict warnings, for the admin endpoints. */
  async getSettingsWithWarnings(): Promise<BookingSettings> {
    const settings = await this.getSettings();
    const lateCancelThresholdMin = await this.readInt(
      CommerceSettingKey.EXPERT_LATE_CANCEL_THRESHOLD_MIN,
      DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
      0,
    );
    const warning = lateCancelLeadTimeWarning(
      lateCancelThresholdMin,
      settings.minLeadTimeMin,
    );
    return { ...settings, warnings: warning ? [warning] : [] };
  }

  async updateSettings(
    userId: string,
    dto: UpdateBookingSettingsDto,
  ): Promise<BookingSettings> {
    if (
      dto.confirmTimeoutMin === undefined &&
      dto.noShowGraceMin === undefined &&
      dto.minLeadTimeMin === undefined
    ) {
      throw new BadRequestException('Cần ít nhất một giá trị để cập nhật');
    }
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
    return this.getSettingsWithWarnings();
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
