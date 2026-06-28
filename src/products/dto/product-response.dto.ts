import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductIngredientResponseDto {
  @ApiProperty({ example: 'Salicylic Acid' })
  name!: string;

  @ApiPropertyOptional({ example: 1.5, nullable: true })
  concentrationPct!: number | null;

  @ApiProperty({ example: true })
  isKeyIngredient!: boolean;
}

export class ProductVariantResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'LRP-EFFAC-SERUM-30ML' })
  sku!: string;

  @ApiPropertyOptional({ example: '30ml', nullable: true })
  volume!: string | null;

  @ApiPropertyOptional({ example: 'Bottle', nullable: true })
  packaging!: string | null;

  @ApiProperty({ example: 650000 })
  priceVnd!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class ProductResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'La Roche-Posay Effaclar Serum' })
  name!: string;

  @ApiProperty({ example: 'uuid' })
  brandId!: string;

  @ApiProperty({ example: 'La Roche-Posay' })
  brandName!: string;

  @ApiProperty({ example: 'uuid' })
  categoryId!: string;

  @ApiProperty({ example: 'Serum' })
  categoryName!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: [ProductVariantResponseDto] })
  variants!: ProductVariantResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProductDetailResponseDto {
  @ApiProperty({ type: ProductResponseDto })
  product!: ProductResponseDto;

  @ApiProperty({ type: [ProductIngredientResponseDto] })
  ingredients!: ProductIngredientResponseDto[];
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductDetailResponseDto] })
  items!: ProductDetailResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
