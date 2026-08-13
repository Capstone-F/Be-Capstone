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

  @ApiProperty({ example: 50 })
  stockQuantity!: number;
}
