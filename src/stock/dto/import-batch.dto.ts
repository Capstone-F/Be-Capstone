import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportBatchDto {
  @ApiProperty({ description: 'Product UUID' })
  productId!: string;

  @ApiProperty({ description: 'Quantity to import', example: 100 })
  quantity!: number;

  @ApiProperty({
    description: 'Manufacturing date (ISO date)',
    example: '2026-01-15',
  })
  manufacturingDate!: string;

  @ApiPropertyOptional({
    description: 'Supplier/lot batch code',
    example: 'LOT-2026-001',
  })
  batchCode?: string;
}
