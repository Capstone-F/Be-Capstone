import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ConsultationStatus } from '../../consultations/enums';

/**
 * Query for a clinic manager listing bookings across all experts in their clinic.
 */
export class ListClinicBookingsQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text search query (matches customer name, expert name, or booking ID)',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Alias for search',
  })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter to a single expert (must belong to the clinic)',
  })
  @IsOptional()
  @IsUUID()
  expertId?: string;

  @ApiPropertyOptional({ enum: ConsultationStatus })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @ApiPropertyOptional({
    description: 'Lower bound (inclusive) on scheduledAt, ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Upper bound (inclusive) on scheduledAt, ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
