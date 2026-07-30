import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoutinePeriod, RoutineStatus, RoutineType } from '../enums';

export class RoutineStepProductVariantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Product display name' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  sku!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Product variant image URL when available',
  })
  imageUrl!: string | null;
}

export class RoutineStepResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RoutinePeriod })
  period!: RoutinePeriod;

  @ApiProperty()
  stepOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  instructions!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Minutes to wait after this step before the next product',
  })
  waitMinutes!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Human-readable dosage, e.g. pea-sized or 2 pumps',
  })
  dosageText!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Numeric dosage in milliliters when measurable',
  })
  amountMl!: number | null;

  @ApiPropertyOptional({ nullable: true })
  protocolId!: string | null;

  @ApiPropertyOptional({
    type: RoutineStepProductVariantDto,
    nullable: true,
    description: 'Linked product variant; null when the step has no product',
  })
  productVariant!: RoutineStepProductVariantDto | null;
}

export class RoutineResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: RoutineType })
  type!: RoutineType;

  @ApiProperty({ enum: RoutineStatus })
  status!: RoutineStatus;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceOrderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerSurveyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  surveyRecommendationId!: string | null;

  @ApiProperty({
    type: [RoutineStepResponseDto],
    description:
      'Steps sorted by period (MORNING then EVENING), then stepOrder',
  })
  steps!: RoutineStepResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}
