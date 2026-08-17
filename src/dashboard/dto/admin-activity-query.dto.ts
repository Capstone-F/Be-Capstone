import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Every activity type GET /admin/activity can emit. */
export const ADMIN_ACTIVITY_TYPES = [
  'USER_CREATED',
  'PRODUCT_PAYMENT',
  'CONSULTATION_PAYMENT',
  'TREATMENT_PLAN_PAYMENT',
  'REFUND',
  'ORDER_CANCELLATION',
  'STOCK_IMPORT',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWAL_PAID',
  'WITHDRAWAL_REJECTED',
] as const;

export type AdminActivityType = (typeof ADMIN_ACTIVITY_TYPES)[number];

export class AdminActivityQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_ACTIVITY_TYPES,
    isArray: true,
    description: 'Repeatable, e.g. ?type=REFUND&type=WITHDRAWAL_PAID',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value == null ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsIn(ADMIN_ACTIVITY_TYPES, { each: true })
  type?: AdminActivityType[];

  @ApiPropertyOptional({
    description: 'Calendar date (YYYY-MM-DD, Asia/Ho_Chi_Minh) — from 00:00:00',
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(DATE_ONLY)
  from?: string;

  @ApiPropertyOptional({
    description:
      'Calendar date (YYYY-MM-DD, Asia/Ho_Chi_Minh) — until 23:59:59.999',
    example: '2026-08-16',
  })
  @IsOptional()
  @Matches(DATE_ONLY)
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by the acting user' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
