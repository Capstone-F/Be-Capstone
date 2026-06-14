import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { Ingredient } from '../ingredients/ingredient.entity';
import { GoalIngredient } from '../treatment-goals/goal-ingredient.entity';
import { TreatmentGoal } from '../treatment-goals/treatment-goal.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductOnboardingService } from './product-onboarding.service';
import { Product } from './product.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Ingredient,
      ProductIngredient,
      TreatmentGoal,
      GoalIngredient,
      IngredientConflict,
    ]),
    AuthModule,
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductOnboardingService,
    SessionGuard,
    RolesGuard,
  ],
  exports: [ProductsService, ProductOnboardingService, TypeOrmModule],
})
export class ProductsModule {}
