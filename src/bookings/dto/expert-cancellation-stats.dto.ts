import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ExpertCancellationPolicyDto {
  @ApiProperty({
    example: 3,
    description:
      'Violation score inside the window at which the expert is flagged on the report.',
  })
  cancelLimit!: number;

  @ApiProperty({
    example: 30,
    description:
      'Default rolling window (days) the cancellation report looks back over.',
  })
  windowDays!: number;

  @ApiProperty({
    example: 2,
    description:
      'Score weight of a no-show or late cancel; an ordinary expert cancel counts 1.',
  })
  noShowWeight!: number;

  @ApiProperty({
    example: 1440,
    description:
      'An expert cancel within this many minutes before the slot is stamped ' +
      'EXPERT_LATE_CANCEL (no-show-grade, unlocks customer feedback). 0 disables.',
  })
  lateCancelThresholdMin!: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Cross-key conflict notes (e.g. late-cancel threshold vs booking minimum ' +
      'lead time). Informational — the values are stored regardless.',
  })
  warnings?: string[];
}

export class UpdateExpertCancellationPolicyDto {
  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  cancelLimit?: number;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  noShowWeight?: number;

  @ApiPropertyOptional({
    example: 1440,
    minimum: 0,
    maximum: 10080,
    description: '0 disables late-cancel stamping',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  lateCancelThresholdMin?: number;
}

export class ExpertCancellationStatsQueryDto {
  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 365,
    description:
      'Override the rolling window in days. Defaults to the configured window.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class AdminExpertCancellationStatsQueryDto extends ExpertCancellationStatsQueryDto {
  @ApiPropertyOptional({ description: 'Restrict the report to one clinic.' })
  @IsOptional()
  @IsUUID()
  clinicId?: string;
}

export class ExpertCancellationStatItemDto {
  @ApiProperty()
  expertId!: string;

  @ApiProperty({ nullable: true, type: String })
  expertName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  clinicId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  clinicName!: string | null;

  @ApiProperty({
    description:
      'Whether the expert can still be booked. Admin/clinic manager deactivates the expert to act on abuse.',
  })
  isActive!: boolean;

  @ApiProperty({
    description: 'Bookings assigned to the expert (created) inside the window.',
  })
  assignedCount!: number;

  @ApiProperty({
    description:
      'Bookings the expert cancelled themselves (cancelledBy = EXPERT) inside the window, late cancels included.',
  })
  expertCancelCount!: number;

  @ApiProperty({
    description:
      'Subset of expertCancelCount stamped EXPERT_LATE_CANCEL — cancelled inside the late-cancel threshold before the slot.',
  })
  lateCancelCount!: number;

  @ApiProperty({
    description:
      'Bookings auto-cancelled as EXPERT_NO_SHOW inside the window — silently skipping is worse than cancelling.',
  })
  noShowCount!: number;

  @ApiProperty({
    description:
      'Weighted violation score: ordinary cancels count 1, late cancels and no-shows count noShowWeight each.',
  })
  violationScore!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'expertCancelCount / assignedCount, rounded to 4 decimals. Null when no bookings were assigned in the window.',
  })
  cancelRate!: number | null;

  @ApiProperty({
    description: 'True when violationScore has reached the configured limit.',
  })
  exceedsLimit!: boolean;
}

export class ExpertCancellationStatsResponseDto {
  @ApiProperty({ example: 30 })
  windowDays!: number;

  @ApiProperty({ example: 3 })
  cancelLimit!: number;

  @ApiProperty({ example: 2 })
  noShowWeight!: number;

  @ApiProperty({
    example: '2026-07-25T00:00:00.000Z',
    description: 'Start of the rolling window the counts cover.',
  })
  from!: string;

  @ApiProperty()
  totalExperts!: number;

  @ApiProperty({ description: 'Experts at or over the violation-score limit.' })
  flaggedCount!: number;

  @ApiProperty({ type: [ExpertCancellationStatItemDto] })
  items!: ExpertCancellationStatItemDto[];
}
