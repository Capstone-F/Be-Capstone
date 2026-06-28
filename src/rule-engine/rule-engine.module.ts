import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { Label } from '../survey/label.entity';
import { SurveyModule } from '../survey/survey.module';
import { RuleEngineService } from './rule-engine.service';

@Module({
  imports: [
    IngredientsModule,
    SurveyModule,
    TypeOrmModule.forFeature([Label, IngredientProtocol]),
  ],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
