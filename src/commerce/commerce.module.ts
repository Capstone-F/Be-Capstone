import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { Transaction } from './transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Transaction])],
  exports: [TypeOrmModule],
})
export class CommerceModule {}
