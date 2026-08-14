import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TreatmentEventType, TreatmentPhaseType } from '../enums';

export class CreateTreatmentDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Originating consultation (IN_PROGRESS during live session, or COMPLETED)',
  })
  @IsOptional()
  @IsUUID()
  sourceConsultationId?: string;
}

export class CreateTreatmentPhaseDto {
  @ApiProperty({ enum: TreatmentPhaseType })
  @IsEnum(TreatmentPhaseType)
  phaseType!: TreatmentPhaseType;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  phaseOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Expert clinical justification for this phase (required before submit)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  noteByExpert?: string;

  @ApiProperty({ example: 500000, description: 'Phase service fee in VND' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd!: number;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateTreatmentPhaseDto {
  @ApiPropertyOptional({ enum: TreatmentPhaseType })
  @IsOptional()
  @IsEnum(TreatmentPhaseType)
  phaseType?: TreatmentPhaseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  phaseOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goals?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description:
      'Expert clinical justification for this phase (required before submit)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  noteByExpert?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class SetPhaseIngredientsDto {
  @ApiProperty({ type: [String], description: 'Ingredient UUIDs' })
  @IsUUID('4', { each: true })
  ingredientIds!: string[];
}

export class SetPhaseProductsDto {
  @ApiProperty({ type: [String], description: 'Product variant UUIDs' })
  @IsUUID('4', { each: true })
  productVariantIds!: string[];
}

export class UpdateRoutineStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['MORNING', 'EVENING'] })
  @IsOptional()
  @IsString()
  period?: 'MORNING' | 'EVENING';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stepOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitMinutes?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dosageText?: string | null;

  @ApiPropertyOptional({
    description:
      'Liều lượng mỗi lần dùng (ml). Dùng cho dự báo hết sản phẩm của khách hàng.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMl?: number | null;
}

export class UpdateExpertRoutineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ type: [UpdateRoutineStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRoutineStepDto)
  steps?: UpdateRoutineStepDto[];
}

export class CancelTreatmentDto {
  @ApiPropertyOptional({ description: 'Why the plan is being cancelled' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateTreatmentEventDto {
  @ApiProperty({ enum: TreatmentEventType })
  @IsEnum(TreatmentEventType)
  type!: TreatmentEventType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Required when type is PROGRESS_PHOTO',
  })
  @ValidateIf(
    (o: CreateTreatmentEventDto) =>
      o.type === TreatmentEventType.PROGRESS_PHOTO,
  )
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  photoUrl?: string | null;

  @ApiPropertyOptional({
    description: 'ISO timestamp; defaults to now',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class UpdateTreatmentEventPhotoDto {
  @ApiProperty({
    example: 'https://placehold.co/400',
    description:
      'Progress photo URL (e.g. from POST /uploads/images). Only for PROGRESS_PHOTO events.',
  })
  @IsUrl({ require_tld: false })
  photoUrl!: string;
}
