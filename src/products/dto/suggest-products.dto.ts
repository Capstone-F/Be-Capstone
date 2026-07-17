import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ProductDetailResponseDto } from './product-response.dto';

export class SuggestProductsQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SuggestedProductsResponseDto {
  @ApiProperty({ type: [ProductDetailResponseDto] })
  items!: ProductDetailResponseDto[];

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}
