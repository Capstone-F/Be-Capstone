import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Order } from '../commerce/order.entity';
import { Payment } from '../payments/payment.entity';
import { Customer } from '../users/customer.entity';
import { DeliveryController } from './delivery.controller';
import { DeliveryFee } from './delivery-fee.entity';
import { DeliveryProvider } from './delivery-provider.entity';
import { Delivery } from './delivery.entity';
import { DeliveryService } from './delivery.service';
import { OrderDeliveryController } from './order-delivery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Delivery,
      DeliveryProvider,
      DeliveryFee,
      Order,
      Payment,
      Customer,
    ]),
    AuthModule,
  ],
  controllers: [DeliveryController, OrderDeliveryController],
  providers: [DeliveryService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, DeliveryService],
})
export class DeliveryModule {}
