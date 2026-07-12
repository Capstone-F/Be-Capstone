import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSource } from '../../commerce/enums';

export class CartItemResponseDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  quantity!: number;
}

export class CartResponseDto {
  @ApiPropertyOptional({ enum: OrderSource, nullable: true })
  source!: OrderSource | null;

  @ApiPropertyOptional({ nullable: true })
  surveyRecommendationId!: string | null;

  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];
}
