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
import { StockModule } from '../stock/stock.module';
import { Customer } from '../users/customer.entity';
import { WalletModule } from '../wallet/wallet.module';
import { CommerceSetting } from './commerce-setting.entity';
import { CommerceSettingsController } from './commerce-settings.controller';
import { OrderCancellationItem } from './order-cancellation-item.entity';
import { OrderCancellationProcessor } from './order-cancellation.processor';
import { OrderCancellation } from './order-cancellation.entity';
import { OrderCancellationsController } from './order-cancellations.controller';
import { OrderCancellationsService } from './order-cancellations.service';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersAdminController } from './orders-admin.controller';
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
      OrderCancellation,
      OrderCancellationItem,
    ]),
    CartModule,
    RecommendationsModule,
    AuthModule,
    DeliveryModule,
    StockModule,
    WalletModule,
  ],
  controllers: [
    OrdersController,
    OrdersAdminController,
    CommerceSettingsController,
    OrderCancellationsController,
  ],
  providers: [
    OrdersService,
    OrderCancellationsService,
    OrderCancellationProcessor,
    SessionGuard,
    RolesGuard,
  ],
  exports: [TypeOrmModule, OrdersService, OrderCancellationsService],
})
export class CommerceModule {}
