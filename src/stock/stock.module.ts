import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductVariant } from '../products/product-variant.entity';
import { SessionGuard } from '../auth/guards/session.guard';
import { StockBatch } from './stock-batch.entity';
import { StockController } from './stock.controller';
import { StockMovement } from './stock-movement.entity';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductVariant, StockBatch, StockMovement]),
    AuthModule,
  ],
  controllers: [StockController],
  providers: [StockService, SessionGuard],
  exports: [StockService],
})
export class StockModule {}
