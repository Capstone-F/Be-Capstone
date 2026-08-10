import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductVariant } from '../products/product-variant.entity';
import { ProductInstance } from './product-instance.entity';
import { StockBatch } from './stock-batch.entity';
import { StockController } from './stock.controller';
import { StockImportForm } from './stock-import-form.entity';
import { StockImportFormsController } from './stock-import-forms.controller';
import { StockImportFormsService } from './stock-import-forms.service';
import { StockMovement } from './stock-movement.entity';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductVariant,
      StockBatch,
      StockMovement,
      ProductInstance,
      StockImportForm,
    ]),
    AuthModule,
  ],
  controllers: [StockController, StockImportFormsController],
  providers: [StockService, StockImportFormsService],
  exports: [StockService, StockImportFormsService],
})
export class StockModule {}
