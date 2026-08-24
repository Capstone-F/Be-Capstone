import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { StockModule } from '../stock/stock.module';
import { TreatmentPhase } from '../treatments/treatment-phase.entity';
import { Customer } from '../users/customer.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      ProductVariant,
      ProductProtocol,
      IngredientConflict,
      TreatmentPhase,
    ]),
    RecommendationsModule,
    StockModule,
    AuthModule,
  ],
  controllers: [CartController],
  providers: [CartService, SessionGuard, RolesGuard],
  exports: [CartService],
})
export class CartModule {}
