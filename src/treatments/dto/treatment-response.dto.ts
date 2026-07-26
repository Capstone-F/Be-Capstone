import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TreatmentPhaseStatus,
  TreatmentPhaseType,
  TreatmentStatus,
} from '../enums';

export class TreatmentPhaseIngredientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ingredientId!: string;

  @ApiPropertyOptional()
  ingredientName?: string | null;
}

export class TreatmentPhaseProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productVariantId!: string;

  @ApiPropertyOptional({ nullable: true })
  matchScore!: number | null;

  @ApiPropertyOptional()
  productName?: string | null;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  priceVnd?: number | null;
}

export class TreatmentRoutineSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  type!: string;
}

export class TreatmentPhaseResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  treatmentId!: string;

  @ApiProperty({ enum: TreatmentPhaseType })
  phaseType!: TreatmentPhaseType;

  @ApiProperty()
  phaseOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ nullable: true })
  goals!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ description: 'Phase service fee (bigint string)' })
  priceVnd!: string;

  @ApiProperty({ enum: TreatmentPhaseStatus })
  status!: TreatmentPhaseStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ type: [TreatmentPhaseIngredientDto] })
  ingredients?: TreatmentPhaseIngredientDto[];

  @ApiPropertyOptional({ type: [TreatmentPhaseProductDto] })
  products?: TreatmentPhaseProductDto[];

  @ApiPropertyOptional({ type: [TreatmentRoutineSummaryDto] })
  routines?: TreatmentRoutineSummaryDto[];
}

export class TreatmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  expertId!: string;

  @ApiPropertyOptional({ nullable: true })
  clinicId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: TreatmentStatus })
  status!: TreatmentStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  totalPriceVnd!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  paidTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceConsultationId!: string | null;

  @ApiProperty({ type: [TreatmentPhaseResponseDto] })
  phases!: TreatmentPhaseResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProductCandidateDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  priceVnd!: number;

  @ApiProperty({ description: 'Count of selected ingredients present' })
  matchScore!: number;

  @ApiProperty({ type: [String] })
  matchedIngredientIds!: string[];

  @ApiProperty()
  stockQuantity!: number;
}
