import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoutinePeriod, RoutineStatus, RoutineType } from '../enums';

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

  @ApiPropertyOptional({ nullable: true })
  productVariantId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  protocolId!: string | null;
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

  @ApiProperty({ type: [RoutineStepResponseDto] })
  steps!: RoutineStepResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}
