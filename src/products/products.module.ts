import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { Ingredient } from '../ingredients/ingredient.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { ProductBrand } from './product-brand.entity';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductOnboardingService } from './product-onboarding.service';
import { ProductProtocol } from './product-protocol.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductBrand,
      ProductCategory,
      ProductVariant,
      ProductIngredient,
      ProductProtocol,
      Ingredient,
      IngredientProtocol,
      IngredientConflict,
      ProtocolLabel,
    ]),
    IngredientsModule,
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
