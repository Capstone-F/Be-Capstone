import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ExpertSpecialty } from '../expert-specialty.enum';

/**
 * Query for a clinic manager listing experts in their own clinic.
 * Unlike the public expert directory, this includes deactivated experts.
 */
export class ListClinicExpertsQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text search query (matches name, email, or licenseNumber)',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Alias for search',
  })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    enum: ExpertSpecialty,
    example: ExpertSpecialty.DERMATOLOGY,
    description: 'Filter by specialization (exact enum match)',
  })
  @IsOptional()
  @IsEnum(ExpertSpecialty)
  specialization?: ExpertSpecialty;

  @ApiPropertyOptional({
    description:
      'Filter by active state. Omit to return both active and inactive experts.',
  })
  @IsOptional()
  @Transform(({ value }): boolean | undefined => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

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
