import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductCategory } from '../enums/product-category.enum';

export class OnboardIngredientDto {
  @ApiProperty({ example: 'Salicylic Acid' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 1.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  concentrationPct?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isKeyIngredient?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'La Roche-Posay Effaclar Serum' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'La Roche-Posay' })
  @IsString()
  @IsNotEmpty()
  brand!: string;

  @ApiProperty({ enum: ProductCategory, example: ProductCategory.SERUM })
  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @ApiPropertyOptional({ example: 'Anti-acne serum for oily skin' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 650000, minimum: 0 })
  @IsInt()
  @Min(0)
  priceVnd!: number;

  @ApiProperty({ example: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  stockQuantity!: number;

  @ApiProperty({ type: [OnboardIngredientDto] })
  @ValidateNested({ each: true })
  @Type(() => OnboardIngredientDto)
  ingredients!: OnboardIngredientDto[];
}
