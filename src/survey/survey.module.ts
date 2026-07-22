import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { SkinType } from '../users/skin-type.entity';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { AnswerLabel } from './answer-label.entity';
import { Answer } from './answer.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { LabelCategory } from './label-category.entity';
import { Label } from './label.entity';
import { Question } from './question.entity';
import { QuestionOption } from './question-option.entity';
import { SurveyService } from './survey.service';
import { SurveysController } from './surveys.controller';
import { AdminSurveyQuestionsController } from './admin-survey-questions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSurvey,
      Question,
      QuestionOption,
      Answer,
      AnswerLabel,
      LabelCategory,
      Label,
      Customer,
      SkinType,
      CustomerSkinTypeDetails,
      SurveyRecommendation,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SurveysController, AdminSurveyQuestionsController],
  providers: [SurveyService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, SurveyService],
})
export class SurveyModule {}
