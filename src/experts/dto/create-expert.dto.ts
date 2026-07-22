import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpertSpecialty } from '../expert-specialty.enum';

export class CreateExpertDto {
  @ApiProperty({
    description: 'Existing user id with the expert role',
    example: 'uuid',
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    description: 'Partner clinic the expert belongs to (required)',
    example: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  clinicId!: string;

  @ApiProperty({
    enum: ExpertSpecialty,
    example: ExpertSpecialty.DERMATOLOGY,
  })
  @IsEnum(ExpertSpecialty)
  specialization!: ExpertSpecialty;

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

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
