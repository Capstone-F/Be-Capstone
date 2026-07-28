import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { CartModule } from '../cart/cart.module';
import { Order } from '../commerce/order.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { Customer } from '../users/customer.entity';
import { DeliveryProvider } from './delivery-provider.entity';
import { DeliveryStatusEvent } from './delivery-status-event.entity';
import { Delivery } from './delivery.entity';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { GhnClient } from './ghn.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Delivery,
      DeliveryProvider,
      DeliveryStatusEvent,
      Order,
      ProductVariant,
      Customer,
    ]),
    AuthModule,
    CartModule,
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, GhnClient, SessionGuard],
  exports: [TypeOrmModule, DeliveryService],
})
export class DeliveryModule {}
