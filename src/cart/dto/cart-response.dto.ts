import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSource } from '../../commerce/enums';

export class CartItemResponseDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  quantity!: number;
}

export class CartConflictDto {
  @ApiProperty()
  protocolCode!: string;

  @ApiProperty()
  conflictingProtocolCode!: string;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity!: string;

  @ApiProperty({
    description: 'Vietnamese warning text for FE display',
    example: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
  })
  description!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'English reason (legacy / internal)',
  })
  reason!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Cart variant IDs whose product maps to protocolCode',
  })
  productVariantIds!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Cart variant IDs whose product maps to conflictingProtocolCode',
  })
  conflictingProductVariantIds!: string[];
}

export class CartResponseDto {
  @ApiPropertyOptional({ enum: OrderSource, nullable: true })
  source!: OrderSource | null;

  @ApiPropertyOptional({ nullable: true })
  surveyRecommendationId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentPhaseId!: string | null;

  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({
    type: [CartConflictDto],
    description:
      'Soft ingredient-protocol conflicts among products currently in the cart (informational; does not block checkout)',
  })
  conflicts!: CartConflictDto[];
}
