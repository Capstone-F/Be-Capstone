import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TreatmentStatus } from '../enums';

/**
 * Query for a clinic manager listing treatment plans in their clinic.
 */
export class ListClinicTreatmentsQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text search query (matches title, customer name, or expert name)',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Alias for search',
  })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: TreatmentStatus })
  @IsOptional()
  @IsEnum(TreatmentStatus)
  status?: TreatmentStatus;

  @ApiPropertyOptional({
    description: 'Filter to a single expert (must belong to the clinic)',
  })
  @IsOptional()
  @IsUUID()
  expertId?: string;

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
