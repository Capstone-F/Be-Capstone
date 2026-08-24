import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '../../commerce/enums';
import { StockImportFormStatus, StockMovementType } from '../enums';

export class StockImportFormSalesLogQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SalesLogBatchDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001', nullable: true })
  batchCode!: string | null;

  @ApiProperty({ example: 100 })
  initialQuantity!: number;

  @ApiProperty({ example: 40 })
  remainingQuantity!: number;

  @ApiProperty({
    example: 55,
    description: 'Số instance của lô này đang ở trạng thái SOLD',
  })
  soldQuantity!: number;

  @ApiProperty({
    example: 3,
    description: 'Số instance của lô này đang ở trạng thái RETURNED',
  })
  returnedQuantity!: number;

  @ApiProperty({
    example: 2,
    description: 'Số instance của lô này đang ở trạng thái DAMAGED',
  })
  damagedQuantity!: number;

  @ApiProperty({ example: '2027-01-15' })
  expirationDate!: string;
}

export class SalesLogEntryDto {
  @ApiProperty({ example: 'uuid' })
  orderItemId!: string;

  @ApiProperty({ example: 'uuid' })
  orderId!: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.DELIVERED })
  orderStatus!: OrderStatus;

  @ApiProperty()
  orderCreatedAt!: Date;

  @ApiProperty({ example: 'uuid' })
  customerId!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', nullable: true })
  customerName!: string | null;

  @ApiPropertyOptional({ example: 'customer@example.com', nullable: true })
  customerEmail!: string | null;

  @ApiProperty({
    example: 3,
    description: 'Tổng số lượng của dòng đơn hàng (có thể gồm nhiều lô)',
  })
  orderedQuantity!: number;

  @ApiProperty({
    example: 2,
    description: 'Số instance xuất từ lô của phiếu nhập này cho dòng đơn hàng',
  })
  quantityFromBatch!: number;

  @ApiProperty({
    example: 2,
    description: 'Trong số đó, số instance hiện ở trạng thái SOLD',
  })
  soldQuantity!: number;

  @ApiProperty({
    example: 0,
    description: 'Trong số đó, số instance hiện ở trạng thái RETURNED',
  })
  returnedQuantity!: number;

  @ApiProperty({ example: 250000 })
  unitPriceVnd!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Thời điểm trừ kho cho dòng đơn hàng',
  })
  stockDeductedAt!: Date | null;
}

export class SalesLogMovementDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ enum: StockMovementType, example: StockMovementType.SALE })
  type!: StockMovementType;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiPropertyOptional({ example: 'Order deduction', nullable: true })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class StockImportFormSalesLogDto {
  @ApiProperty({ example: 'uuid' })
  formId!: string;

  @ApiProperty({
    enum: StockImportFormStatus,
    example: StockImportFormStatus.CONFIRMED,
  })
  formStatus!: StockImportFormStatus;

  @ApiPropertyOptional({
    example: 'uuid',
    nullable: true,
    description: 'Null khi phiếu chưa CONFIRMED (chưa tạo lô hàng)',
  })
  stockBatchId!: string | null;

  @ApiPropertyOptional({ type: SalesLogBatchDto, nullable: true })
  batch!: SalesLogBatchDto | null;

  @ApiProperty({
    type: [SalesLogMovementDto],
    description: 'Lịch sử biến động SALE/RETURN của lô (mới nhất trước)',
  })
  movements!: SalesLogMovementDto[];

  @ApiProperty({ type: [SalesLogEntryDto] })
  entries!: SalesLogEntryDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
