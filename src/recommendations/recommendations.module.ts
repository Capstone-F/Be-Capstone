import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { RecommendationService } from './recommendation.service';
import { RecommendationsController } from './recommendations.controller';
import { SurveyRecommendationItem } from './survey-recommendation-item.entity';
import { SurveyRecommendation } from './survey-recommendation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyRecommendation,
      SurveyRecommendationItem,
      Customer,
      CustomerSurvey,
      ProductProtocol,
      ProductVariant,
      CustomerAllergy,
      IngredientConflict,
    ]),
    RuleEngineModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationService, SessionGuard, RolesGuard],
  exports: [RecommendationService, TypeOrmModule],
})
export class RecommendationsModule {}
