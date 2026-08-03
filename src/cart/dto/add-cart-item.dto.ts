import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { OrderSource } from '../../commerce/enums';

export class AddCartItemDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    enum: OrderSource,
    description:
      'Required when the cart is empty. SURVEY carts must include surveyRecommendationId.',
  })
  @IsEnum(OrderSource)
  source!: OrderSource;

  @ApiPropertyOptional({
    description:
      'Required when source is SURVEY. Cart may include recommended and other catalog variants.',
  })
  @IsOptional()
  @IsUUID()
  surveyRecommendationId?: string;
}
