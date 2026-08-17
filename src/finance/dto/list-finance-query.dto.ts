import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TransactionStatus, TransactionType } from '../../commerce/enums';
import { ClinicWithdrawalStatus } from '../enums';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ListClinicTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search (matches note or transaction ID)',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Alias for search' })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  expertId?: string;

  @ApiPropertyOptional({ description: 'ISO datetime lower bound' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO datetime upper bound' })
  @IsOptional()
  @IsISO8601()
  to?: string;

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

export class ListAdminTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search (matches note, externalRef or ID)',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ description: 'Filter by one clinic' })
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @ApiPropertyOptional({ description: 'Filter by related customer user' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  expertId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({
    description:
      'Calendar date (YYYY-MM-DD, Asia/Ho_Chi_Minh) — createdAt from 00:00:00',
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(DATE_ONLY)
  from?: string;

  @ApiPropertyOptional({
    description:
      'Calendar date (YYYY-MM-DD, Asia/Ho_Chi_Minh) — createdAt until 23:59:59.999',
    example: '2026-08-16',
  })
  @IsOptional()
  @Matches(DATE_ONLY)
  to?: string;

  @ApiPropertyOptional({ description: 'Minimum amount (inclusive, VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAmountVnd?: number;

  @ApiPropertyOptional({ description: 'Maximum amount (inclusive, VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAmountVnd?: number;

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

export class ListAdminClinicBalancesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by one clinic' })
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @ApiPropertyOptional({ description: 'Search by clinic name' })
  @IsOptional()
  search?: string;

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

export class ListClinicWithdrawalsQueryDto {
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

export class ListAdminClinicWithdrawalsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @ApiPropertyOptional({ enum: ClinicWithdrawalStatus })
  @IsOptional()
  @IsEnum(ClinicWithdrawalStatus)
  status?: ClinicWithdrawalStatus;

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
