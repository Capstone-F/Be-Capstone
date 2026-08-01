import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TreatmentPhaseStatus, TreatmentStatus } from '../../treatments/enums';
import { Gender } from '../../users/gender.enum';

export class SkinTypeSummaryDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;
}

export class BaumannScoresDto {
  @ApiPropertyOptional({ nullable: true })
  oilyDryScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  sensitiveResistantScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  pigmentedNonPigmentedScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  wrinkledTightScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  assessedAt: Date | null;
}

export class CustomerDetailsDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  dateOfBirth: string | null;

  @ApiProperty({ enum: Gender })
  gender: Gender;

  @ApiPropertyOptional({ type: SkinTypeSummaryDto, nullable: true })
  skinType: SkinTypeSummaryDto | null;

  @ApiPropertyOptional({ type: BaumannScoresDto, nullable: true })
  baumannScores: BaumannScoresDto | null;
}

export class AllergyLabelDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
}

export class SurveyAnswerLabelDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
}

export class SurveyAnswerDto {
  @ApiProperty()
  questionCode: string;

  @ApiProperty()
  questionText: string;

  @ApiPropertyOptional({ nullable: true })
  value: string | null;

  @ApiProperty({ type: [SurveyAnswerLabelDto] })
  labels: SurveyAnswerLabelDto[];
}

export class SurveyHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  isCompleted: boolean;

  @ApiPropertyOptional({ nullable: true })
  completedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [SurveyAnswerDto] })
  answers: SurveyAnswerDto[];
}

export class TreatmentHistoryExpertDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;
}

export class TreatmentHistoryClinicDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class TreatmentHistoryCurrentPhaseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phaseOrder: number;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiProperty({ enum: TreatmentPhaseStatus })
  status: TreatmentPhaseStatus;

  @ApiPropertyOptional({ nullable: true })
  noteByExpert: string | null;
}

export class TreatmentHistoryItemDto {
  @ApiProperty()
  treatmentId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: TreatmentStatus })
  status: TreatmentStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate: Date | null;

  @ApiPropertyOptional({ nullable: true })
  endDate: Date | null;

  @ApiProperty({ type: TreatmentHistoryExpertDto })
  expert: TreatmentHistoryExpertDto;

  @ApiPropertyOptional({ type: TreatmentHistoryClinicDto, nullable: true })
  clinic: TreatmentHistoryClinicDto | null;

  @ApiPropertyOptional({
    type: TreatmentHistoryCurrentPhaseDto,
    nullable: true,
  })
  currentPhase: TreatmentHistoryCurrentPhaseDto | null;

  @ApiProperty()
  phaseCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CustomerProfileResponseDto {
  @ApiPropertyOptional({ type: CustomerDetailsDto, nullable: true })
  customer: CustomerDetailsDto | null;

  @ApiProperty({ type: [AllergyLabelDto] })
  allergies: AllergyLabelDto[];

  @ApiProperty({ type: [SurveyHistoryItemDto] })
  surveyHistory: SurveyHistoryItemDto[];

  @ApiProperty({ type: [TreatmentHistoryItemDto] })
  treatmentHistory: TreatmentHistoryItemDto[];
}
