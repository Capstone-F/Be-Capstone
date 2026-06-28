import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryProvider } from './delivery-provider.entity';
import { Delivery } from './delivery.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery, DeliveryProvider])],
  exports: [TypeOrmModule],
})
export class DeliveryModule {}
