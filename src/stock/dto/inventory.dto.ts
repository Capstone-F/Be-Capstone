import { ApiProperty } from '@nestjs/swagger';
import { InventoryStockWarning } from '../enums';

export class InventoryItemDto {
  @ApiProperty({ example: 'uuid' })
  productVariantId!: string;

  @ApiProperty({ example: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Product Name' })
  productName!: string;

  @ApiProperty({ example: 'SKU' })
  sku!: string;

  @ApiProperty({ example: 100000 })
  priceVnd!: number;

  @ApiProperty({ example: 'https://placehold.co/400' })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Total remaining stock across all active batches',
    example: 150,
  })
  stockQuantity!: number;

  @ApiProperty({
    description: 'List of active ingredients',
    example: ['Niacinamide', 'Zinc PCA'],
    type: [String],
  })
  activeIngredients!: string[];

  @ApiProperty({
    description:
      'Restock alert: LOW when stockQuantity is at or below the low-stock threshold, OUT_OF_STOCK when zero',
    enum: InventoryStockWarning,
    nullable: true,
    example: InventoryStockWarning.LOW,
  })
  stockWarning!: InventoryStockWarning | null;

  @ApiProperty({
    description: 'Human-readable restock warning for Staff UI',
    nullable: true,
    example: 'Sắp hết hàng — chỉ còn 8 sản phẩm (ngưỡng cảnh báo 10)',
  })
  warningMessage!: string | null;
}
