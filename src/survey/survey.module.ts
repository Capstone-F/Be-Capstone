import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerLabel } from './answer-label.entity';
import { Answer } from './answer.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { LabelCategory } from './label-category.entity';
import { Label } from './label.entity';
import { Question } from './question.entity';
import { SkinType } from './skin-type.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSurvey,
      Question,
      Answer,
      AnswerLabel,
      LabelCategory,
      Label,
      SkinType,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class SurveyModule {}
