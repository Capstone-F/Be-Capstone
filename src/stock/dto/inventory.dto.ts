import { ApiProperty } from '@nestjs/swagger';

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
}
