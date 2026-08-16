import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderDiscountType, OrderSource, OrderStatus } from '../enums';
import { OrderCancellationSummaryDto } from './order-cancellation-response.dto';

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
  productName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku?: string | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl?: string | null;

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

  @ApiProperty({ description: 'GHN shipping fee, included in totalVnd.' })
  shippingFeeVnd!: number;

  @ApiProperty({ description: 'subtotalVnd - discountVnd + shippingFeeVnd.' })
  totalVnd!: number;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'GHN ProvinceID from the order delivery address.',
  })
  provinceId!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'GHN DistrictID from the order delivery address.',
  })
  districtId!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'GHN WardCode from the order delivery address.',
  })
  wardCode!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Set when a cancellation is requested.',
  })
  cancelledAt!: Date | null;

  @ApiProperty({
    description:
      'True when post-payment stock deduction failed for at least one item. ' +
      'GHN handover is held until staff restock and retry fulfillment.',
  })
  stockShortfall!: boolean;

  @ApiPropertyOptional({
    type: OrderCancellationSummaryDto,
    nullable: true,
    description: 'Present once a cancellation has been requested.',
  })
  cancellation!: OrderCancellationSummaryDto | null;

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
