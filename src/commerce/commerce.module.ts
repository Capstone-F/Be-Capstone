import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { CartModule } from '../cart/cart.module';
import { DeliveryProvider } from '../delivery/delivery-provider.entity';
import { DeliveryModule } from '../delivery/delivery.module';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { Customer } from '../users/customer.entity';
import { CommerceSetting } from './commerce-setting.entity';
import { CommerceSettingsController } from './commerce-settings.controller';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Transaction } from './transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Transaction,
      CommerceSetting,
      ProductVariant,
      Customer,
      DeliveryProvider,
    ]),
    CartModule,
    RecommendationsModule,
    AuthModule,
    DeliveryModule,
  ],
  controllers: [OrdersController, CommerceSettingsController],
  providers: [OrdersService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, OrdersService],
})
export class CommerceModule {}
