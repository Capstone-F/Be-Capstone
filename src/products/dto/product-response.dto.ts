import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCategory } from '../enums/product-category.enum';

export class ProductIngredientResponseDto {
  @ApiProperty({ example: 'Salicylic Acid' })
  name!: string;

  @ApiPropertyOptional({ example: 1.5, nullable: true })
  concentrationPct!: number | null;

  @ApiProperty({ example: true })
  isKeyIngredient!: boolean;
}

export class ProductResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'La Roche-Posay Effaclar Serum' })
  name!: string;

  @ApiProperty({ example: 'La Roche-Posay' })
  brand!: string;

  @ApiProperty({ enum: ProductCategory })
  category!: ProductCategory;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: 650000 })
  priceVnd!: number;

  @ApiProperty({ example: 100 })
  stockQuantity!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

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
