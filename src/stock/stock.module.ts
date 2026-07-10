import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductVariant } from '../products/product-variant.entity';
import { ProductInstance } from './product-instance.entity';
import { StockBatch } from './stock-batch.entity';
import { StockController } from './stock.controller';
import { StockMovement } from './stock-movement.entity';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductVariant,
      StockBatch,
      StockMovement,
      ProductInstance,
    ]),
    AuthModule,
  ],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
