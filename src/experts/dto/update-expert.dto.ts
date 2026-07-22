import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpertSpecialty } from '../expert-specialty.enum';

export class UpdateExpertDto {
  @ApiPropertyOptional({
    description: 'Partner clinic (required when provided; cannot be cleared)',
    example: 'uuid',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  clinicId?: string;

  @ApiPropertyOptional({ enum: ExpertSpecialty })
  @IsOptional()
  @IsEnum(ExpertSpecialty)
  specialization?: ExpertSpecialty;

  @ApiPropertyOptional({ example: 'LIC-12345', nullable: true })
  @IsOptional()
  @IsString()
  licenseNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  bio?: string | null;

  @ApiPropertyOptional({ example: 300000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultationFee?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  sessionLengthHours?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
