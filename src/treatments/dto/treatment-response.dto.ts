import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConflictSeverity } from '../../products/enums/conflict-severity.enum';
import {
  TreatmentCancelledBy,
  TreatmentPhaseStatus,
  TreatmentPhaseType,
  TreatmentStatus,
} from '../enums';

/** Ingredient-protocol conflict between products selected for a phase. */
export class TreatmentProductConflictDto {
  @ApiProperty({ example: 'retinol_0.3_anti_aging' })
  protocolCode!: string;

  @ApiProperty({ example: 'glycolic_exfoliation' })
  conflictingProtocolCode!: string;

  @ApiProperty({ enum: ConflictSeverity })
  severity!: ConflictSeverity;

  @ApiProperty({
    description: 'Vietnamese warning text for display',
    example: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
  })
  description!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty({ type: [String], description: 'Selected variants on side A' })
  productVariantIds!: string[];

  @ApiProperty({ type: [String], description: 'Selected variants on side B' })
  conflictingProductVariantIds!: string[];
}

/** Warning that a candidate conflicts with a product already selected in the phase. */
export class CandidateConflictWarningDto {
  @ApiProperty({
    description: 'Already-selected variant this candidate conflicts with',
  })
  selectedProductVariantId!: string;

  @ApiProperty({ example: 'glycolic_exfoliation' })
  protocolCode!: string;

  @ApiProperty({ example: 'retinol_0.3_anti_aging' })
  conflictingProtocolCode!: string;

  @ApiProperty({ enum: ConflictSeverity })
  severity!: ConflictSeverity;

  @ApiProperty({
    description: 'Vietnamese warning text for display',
    example: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
  })
  description!: string;
}

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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Expert clinical justification for this phase',
  })
  noteByExpert!: string | null;

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

  @ApiPropertyOptional({
    type: [TreatmentProductConflictDto],
    description:
      'Ingredient conflicts among the currently selected products (populated when the expert sets phase products)',
  })
  conflicts?: TreatmentProductConflictDto[];
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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Set when expert submits for payment; null while editing. Customer can pay only when set.',
  })
  submittedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  paidTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceConsultationId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ enum: TreatmentCancelledBy, nullable: true })
  cancelledBy!: TreatmentCancelledBy | null;

  @ApiPropertyOptional({ nullable: true })
  refundTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  refundedAmountVnd!: string | null;

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

  @ApiProperty({
    type: [CandidateConflictWarningDto],
    description:
      'Conflicts between this candidate and products already selected in the phase',
  })
  conflictWarnings!: CandidateConflictWarningDto[];
}
