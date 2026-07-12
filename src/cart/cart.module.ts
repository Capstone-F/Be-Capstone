import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { Customer } from '../users/customer.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, ProductVariant]),
    RecommendationsModule,
    AuthModule,
  ],
  controllers: [CartController],
  providers: [CartService, SessionGuard, RolesGuard],
  exports: [CartService],
})
export class CartModule {}
