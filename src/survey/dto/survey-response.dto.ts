import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ nullable: true })
  intent?: string;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  options?: Array<{ labelCode: string; text: string }>;
}

export class SurveyAnswerLabelDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
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
