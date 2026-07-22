import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SurveyQuestionOptionDto {
  @ApiProperty()
  labelCode!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  vietnameseNormalized!: string | null;
}

export class SurveyQuestionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional({ nullable: true })
  questionType!: string | null;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty()
  priority!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ type: [SurveyQuestionOptionDto] })
  options!: SurveyQuestionOptionDto[];
}

export class SurveyAnswerLabelDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  vietnameseNormalized!: string | null;
}

export class SurveyAnswerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  questionId!: string;

  @ApiPropertyOptional({ nullable: true })
  value!: string | null;

  @ApiProperty({ type: [SurveyAnswerLabelDto] })
  labels!: SurveyAnswerLabelDto[];
}

export class SurveyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  isCompleted!: boolean;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: [SurveyAnswerDto] })
  answers!: SurveyAnswerDto[];

  @ApiProperty()
  createdAt!: Date;
}
