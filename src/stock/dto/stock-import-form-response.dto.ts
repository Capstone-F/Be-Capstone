import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockImportFormStatus } from '../enums';

export class StockImportFormResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  productVariantId!: string;

  @ApiProperty({ example: 100 })
  quantity!: number;

  @ApiProperty({ example: '2026-01-15' })
  manufacturingDate!: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001', nullable: true })
  batchCode!: string | null;

  @ApiProperty({
    enum: StockImportFormStatus,
    example: StockImportFormStatus.DRAFT,
  })
  status!: StockImportFormStatus;

  @ApiProperty({ example: 'uuid' })
  createdByUserId!: string;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  submittedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  submittedAt!: Date | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  confirmedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  confirmedAt!: Date | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  cancelledByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  rejectedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  rejectedAt!: Date | null;

  @ApiPropertyOptional({
    example: 'Incorrect manufacturing date',
    nullable: true,
  })
  rejectionReason!: string | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  stockBatchId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedStockImportFormsDto {
  @ApiProperty({ type: [StockImportFormResponseDto] })
  items!: StockImportFormResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
