import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../users/gender.enum';

export class SkinTypeSummaryDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
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

export class CustomerProfileResponseDto {
  @ApiPropertyOptional({ type: CustomerDetailsDto, nullable: true })
  customer: CustomerDetailsDto | null;

  @ApiProperty({ type: [AllergyLabelDto] })
  allergies: AllergyLabelDto[];

  @ApiProperty({ type: [SurveyHistoryItemDto] })
  surveyHistory: SurveyHistoryItemDto[];
}
