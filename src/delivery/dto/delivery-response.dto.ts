import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus, DeliveryType } from '../enums';

export class DeliveryStatusEventDto {
  @ApiProperty({ description: 'Raw GHN status, e.g. delivering.' })
  providerStatus!: string;

  @ApiProperty()
  occurredAt!: Date;
}

export class DeliveryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiProperty({ enum: DeliveryType })
  type!: DeliveryType;

  @ApiPropertyOptional({
    nullable: true,
    description: 'GHN order_code. Null until payment succeeds.',
  })
  providerOrderCode!: string | null;

  @ApiProperty()
  shippingFeeVnd!: number;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryTime!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  shippedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  deliveredAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  recipientName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  streetAddress!: string | null;

  @ApiProperty({
    type: [DeliveryStatusEventDto],
    description: 'Tracking history.',
  })
  statusEvents!: DeliveryStatusEventDto[];
}
