import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '../../consultations/enums';
import {
  TreatmentEventType,
  TreatmentPhaseStatus,
  TreatmentPhaseType,
  TreatmentStatus,
} from '../enums';
import { TreatmentPhaseResponseDto } from './treatment-response.dto';

export class TreatmentEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  treatmentId!: string;

  @ApiProperty({ enum: TreatmentEventType })
  type!: TreatmentEventType;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty()
  occurredAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  createdByExpertId!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class TreatmentChartProductUsedDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiPropertyOptional({ nullable: true })
  productName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku!: string | null;

  @ApiProperty({ description: 'Times marked COMPLETED in phase routines' })
  completedCount!: number;

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ type: [String] })
  phaseIds!: string[];
}

export class TreatmentChartSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConsultationStatus })
  status!: ConsultationStatus;

  @ApiProperty()
  isFollowUp!: boolean;

  @ApiPropertyOptional({ nullable: true })
  scheduledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  feedbackRating!: number | null;

  @ApiPropertyOptional({ nullable: true })
  feedbackComment!: string | null;
}

export class TreatmentChartConsultationResultDto {
  @ApiPropertyOptional({ nullable: true })
  sourceConsultation!: TreatmentChartSessionDto | null;

  @ApiProperty({
    type: [TreatmentChartSessionDto],
    description: 'Completed follow-up / linked sessions for this plan',
  })
  followUpSessions!: TreatmentChartSessionDto[];
}

export class TreatmentChartPhaseSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TreatmentPhaseType })
  phaseType!: TreatmentPhaseType;

  @ApiProperty()
  phaseOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiProperty({ enum: TreatmentPhaseStatus })
  status!: TreatmentPhaseStatus;

  @ApiPropertyOptional({ nullable: true })
  noteByExpert!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;
}

export class TreatmentChartResponseDto {
  @ApiProperty()
  treatmentId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: TreatmentStatus })
  status!: TreatmentStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ type: [TreatmentChartPhaseSummaryDto] })
  phases!: TreatmentChartPhaseSummaryDto[];

  @ApiProperty({ type: [TreatmentEventResponseDto] })
  progressPhotos!: TreatmentEventResponseDto[];

  @ApiProperty({ type: [TreatmentChartProductUsedDto] })
  productsUsed!: TreatmentChartProductUsedDto[];

  @ApiProperty({ type: [TreatmentChartSessionDto] })
  inPersonSessions!: TreatmentChartSessionDto[];

  @ApiProperty({ type: TreatmentChartConsultationResultDto })
  consultationResults!: TreatmentChartConsultationResultDto;

  @ApiPropertyOptional({
    type: [TreatmentPhaseResponseDto],
    description: 'Full phase payloads when useful for FE detail',
  })
  phaseDetails?: TreatmentPhaseResponseDto[];
}
