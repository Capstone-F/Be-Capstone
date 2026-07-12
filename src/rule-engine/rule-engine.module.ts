import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { RuleEngineService } from './rule-engine.service';

@Module({
  imports: [
    IngredientsModule,
    TypeOrmModule.forFeature([
      Label,
      IngredientProtocol,
      Customer,
      CustomerSkinTypeDetails,
      CustomerSurvey,
    ]),
  ],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
