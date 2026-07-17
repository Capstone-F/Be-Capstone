import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListSurveyQuestionsDto {
  @ApiPropertyOptional({
    description:
      'Current survey session used to unlock conditional questions from prior answers',
  })
  @IsOptional()
  @IsUUID()
  surveyId?: string;
}
