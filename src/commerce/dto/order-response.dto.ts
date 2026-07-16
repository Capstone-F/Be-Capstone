import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderDiscountType, OrderSource, OrderStatus } from '../enums';

export class OrderItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPriceVnd!: number;

  @ApiProperty()
  lineTotalVnd!: number;

  @ApiPropertyOptional({ nullable: true })
  surveyRecommendationItemId!: string | null;
}

export class OrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderSource })
  source!: OrderSource;

  @ApiPropertyOptional({ nullable: true })
  customerSurveyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  surveyRecommendationId!: string | null;

  @ApiProperty()
  subtotalVnd!: number;

  @ApiProperty()
  discountVnd!: number;

  @ApiPropertyOptional({ enum: OrderDiscountType, nullable: true })
  discountType!: OrderDiscountType | null;

  @ApiProperty({
    description: 'Shipping fee locked when delivery is attached; 0 until then',
    example: 30000,
  })
  shippingFeeVnd!: number;

  @ApiProperty({
    description:
      'Payable amount: max(0, subtotalVnd − discountVnd + shippingFeeVnd)',
  })
  totalVnd!: number;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedOrdersDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items!: OrderResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
