import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Customer } from '../users/customer.entity';
import { AnswerLabel } from './answer-label.entity';
import { Answer } from './answer.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { LabelCategory } from './label-category.entity';
import { Label } from './label.entity';
import { Question } from './question.entity';
import { SurveyService } from './survey.service';
import { SurveysController } from './surveys.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSurvey,
      Question,
      Answer,
      AnswerLabel,
      LabelCategory,
      Label,
      Customer,
    ]),
    AuthModule,
  ],
  controllers: [SurveysController],
  providers: [SurveyService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, SurveyService],
})
export class SurveyModule {}
