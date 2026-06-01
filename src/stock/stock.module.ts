import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Product } from '../products/product.entity';
import { SessionGuard } from '../auth/guards/session.guard';
import { StockBatch } from './stock-batch.entity';
import { StockController } from './stock.controller';
import { StockMovement } from './stock-movement.entity';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, StockBatch, StockMovement]),
    AuthModule,
  ],
  controllers: [StockController],
  providers: [StockService, SessionGuard],
  exports: [StockService],
})
export class StockModule {}
