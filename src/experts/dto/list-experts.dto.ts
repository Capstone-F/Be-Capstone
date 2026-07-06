import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ExpertSpecialty } from '../expert-specialty.enum';

export class ListExpertsQueryDto {
  @ApiPropertyOptional({
    enum: ExpertSpecialty,
    example: ExpertSpecialty.DERMATOLOGY,
    description: 'Filter by specialization (exact enum match)',
  })
  @IsOptional()
  @IsEnum(ExpertSpecialty)
  specialization?: ExpertSpecialty;

  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Minimum consultation fee (VND)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minFee?: number;

  @ApiPropertyOptional({
    example: 500000,
    description: 'Maximum consultation fee (VND)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFee?: number;

  @ApiPropertyOptional({
    example: 10.7769,
    description: 'Client latitude for distance filtering',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: 106.7009,
    description: 'Client longitude for distance filtering',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Maximum distance in km from client location',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  radiusKm?: number;

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
