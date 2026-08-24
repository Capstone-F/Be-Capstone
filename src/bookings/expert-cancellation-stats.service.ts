import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
import { CommerceSettingKey } from '../commerce/enums';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import {
  BookingAutoCancelReason,
  BookingCancelledBy,
} from '../consultations/enums';
import {
  ExpertCancellationPolicyDto,
  ExpertCancellationStatItemDto,
  ExpertCancellationStatsResponseDto,
  UpdateExpertCancellationPolicyDto,
} from './dto/expert-cancellation-stats.dto';

export const DEFAULT_EXPERT_CANCEL_LIMIT = 3;
export const DEFAULT_EXPERT_CANCEL_WINDOW_DAYS = 30;
export const DEFAULT_EXPERT_NO_SHOW_WEIGHT = 2;
export const DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN = 1440;

type RawStatRow = {
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

/**
 * Read-only abuse report over data the booking flow already records: per-expert
 * cancel counts inside a rolling window, flagged against an admin-configurable
 * limit stored in commerce_settings. Detection and flagging are automatic; the
 * decision (toggling expert.isActive) stays with a human.
 */
@Injectable()
export class ExpertCancellationStatsService {
  constructor(
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepository: Repository<ConsultationRequest>,
    @InjectRepository(CommerceSetting)
    private readonly settingRepository: Repository<CommerceSetting>,
  ) {}

  async getPolicy(): Promise<ExpertCancellationPolicyDto> {
    return {
      cancelLimit: await this.readInt(
        CommerceSettingKey.EXPERT_CANCEL_LIMIT_30D,
        DEFAULT_EXPERT_CANCEL_LIMIT,
        1,
      ),
      windowDays: await this.readInt(
        CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS,
        DEFAULT_EXPERT_CANCEL_WINDOW_DAYS,
        1,
      ),
      noShowWeight: await this.readInt(
        CommerceSettingKey.EXPERT_NO_SHOW_WEIGHT,
        DEFAULT_EXPERT_NO_SHOW_WEIGHT,
        1,
      ),
      lateCancelThresholdMin: await this.readInt(
        CommerceSettingKey.EXPERT_LATE_CANCEL_THRESHOLD_MIN,
        DEFAULT_EXPERT_LATE_CANCEL_THRESHOLD_MIN,
        0,
      ),
    };
  }

  async updatePolicy(
    userId: string,
    dto: UpdateExpertCancellationPolicyDto,
  ): Promise<ExpertCancellationPolicyDto> {
    if (dto.cancelLimit !== undefined) {
      await this.upsert(
        CommerceSettingKey.EXPERT_CANCEL_LIMIT_30D,
        dto.cancelLimit,
        userId,
      );
    }
    if (dto.windowDays !== undefined) {
      await this.upsert(
        CommerceSettingKey.EXPERT_CANCEL_WINDOW_DAYS,
        dto.windowDays,
        userId,
      );
    }
    if (dto.noShowWeight !== undefined) {
      await this.upsert(
        CommerceSettingKey.EXPERT_NO_SHOW_WEIGHT,
        dto.noShowWeight,
        userId,
      );
    }
    if (dto.lateCancelThresholdMin !== undefined) {
      await this.upsert(
        CommerceSettingKey.EXPERT_LATE_CANCEL_THRESHOLD_MIN,
        dto.lateCancelThresholdMin,
        userId,
      );
    }
    return this.getPolicy();
  }

  async getStats(
    options: { clinicId?: string; days?: number } = {},
  ): Promise<ExpertCancellationStatsResponseDto> {
    const policy = await this.getPolicy();
    const windowDays = options.days ?? policy.windowDays;
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const qb = this.consultationRepository
      .createQueryBuilder('c')
      .innerJoin('c.expert', 'expert')
      .leftJoin('expert.user', 'expertUser')
      .leftJoin('expert.clinic', 'clinic')
      .select('expert.id', 'expertId')
      .addSelect('expertUser.name', 'expertName')
      .addSelect('expert.clinicId', 'clinicId')
      .addSelect('clinic.name', 'clinicName')
      .addSelect('expert.isActive', 'isActive')
      .addSelect(
        'CAST(COUNT(*) FILTER (WHERE c.createdAt >= :since) AS int)',
        'assignedCount',
      )
      .addSelect(
        'CAST(COUNT(*) FILTER (WHERE c.cancelledBy = :expertActor AND c.cancelledAt >= :since) AS int)',
        'expertCancelCount',
      )
      .addSelect(
        'CAST(COUNT(*) FILTER (WHERE c.autoCancelReason = :lateCancelReason AND c.cancelledAt >= :since) AS int)',
        'lateCancelCount',
      )
      .addSelect(
        'CAST(COUNT(*) FILTER (WHERE c.autoCancelReason = :noShowReason AND c.cancelledAt >= :since) AS int)',
        'noShowCount',
      )
      .where('(c.createdAt >= :since OR c.cancelledAt >= :since)')
      .groupBy('expert.id')
      .addGroupBy('expertUser.name')
      .addGroupBy('expert.clinicId')
      .addGroupBy('clinic.name')
      .addGroupBy('expert.isActive')
      .setParameters({
        since,
        expertActor: BookingCancelledBy.EXPERT,
        lateCancelReason: BookingAutoCancelReason.EXPERT_LATE_CANCEL,
        noShowReason: BookingAutoCancelReason.EXPERT_NO_SHOW,
      });

    if (options.clinicId) {
      qb.andWhere('expert.clinicId = :clinicId', {
        clinicId: options.clinicId,
      });
    }

    const rows = await qb.getRawMany<RawStatRow>();

    const items: ExpertCancellationStatItemDto[] = rows
      .map((row) => {
        const assignedCount = Number(row.assignedCount) || 0;
        const expertCancelCount = Number(row.expertCancelCount) || 0;
        const lateCancelCount = Number(row.lateCancelCount) || 0;
        const noShowCount = Number(row.noShowCount) || 0;
        // Ordinary cancels count 1; late cancels and no-shows count
        // noShowWeight each (late cancels are a subset of expertCancelCount).
        const violationScore =
          expertCancelCount -
          lateCancelCount +
          policy.noShowWeight * (lateCancelCount + noShowCount);
        return {
          expertId: row.expertId,
          expertName: row.expertName ?? null,
          clinicId: row.clinicId ?? null,
          clinicName: row.clinicName ?? null,
          isActive: !!row.isActive,
          assignedCount,
          expertCancelCount,
          lateCancelCount,
          noShowCount,
          violationScore,
          // Cancels may target bookings created before the window, so the
          // rate can exceed 1; the raw counts are shown alongside it.
          cancelRate:
            assignedCount > 0
              ? Number((expertCancelCount / assignedCount).toFixed(4))
              : null,
          exceedsLimit: violationScore >= policy.cancelLimit,
        };
      })
      .sort(
        (a, b) =>
          b.violationScore - a.violationScore ||
          b.expertCancelCount - a.expertCancelCount ||
          (b.cancelRate ?? 0) - (a.cancelRate ?? 0),
      );

    return {
      windowDays,
      cancelLimit: policy.cancelLimit,
      noShowWeight: policy.noShowWeight,
      from: since.toISOString(),
      totalExperts: items.length,
      flaggedCount: items.filter((item) => item.exceedsLimit).length,
      items,
    };
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
