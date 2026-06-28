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
import { ShelfLifeUnit } from '../../stock/enums';

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

  @ApiProperty({ example: 'SERUM' })
  @IsString()
  @IsNotEmpty()
  categoryCode!: string;

  @ApiPropertyOptional({ example: 'Serum' })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional({ example: 'Anti-acne serum for oily skin' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'LRP-EFFAC-SERUM-30ML' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiPropertyOptional({ example: '30ml' })
  @IsOptional()
  @IsString()
  volume?: string;

  @ApiPropertyOptional({ example: 'Bottle' })
  @IsOptional()
  @IsString()
  packaging?: string;

  @ApiProperty({ example: 650000, minimum: 0 })
  @IsInt()
  @Min(0)
  priceVnd!: number;

  @ApiPropertyOptional({ example: 365, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  shelfLifeValue?: number;

  @ApiPropertyOptional({ enum: ShelfLifeUnit, default: ShelfLifeUnit.DAY })
  @IsOptional()
  @IsEnum(ShelfLifeUnit)
  shelfLifeUnit?: ShelfLifeUnit;

  @ApiProperty({ type: [OnboardIngredientDto] })
  @ValidateNested({ each: true })
  @Type(() => OnboardIngredientDto)
  ingredients!: OnboardIngredientDto[];
}
