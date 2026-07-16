import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus, DeliveryType } from '../enums';

export class DeliveryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  providerId!: string;

  @ApiPropertyOptional({ example: 'GHN' })
  providerCode!: string | null;

  @ApiPropertyOptional({ example: 'Giao Hàng Nhanh' })
  providerName!: string | null;

  @ApiProperty({ enum: DeliveryType })
  type!: DeliveryType;

  @ApiProperty()
  shippingAddress!: string;

  @ApiProperty({ example: 30000 })
  feeVnd!: number;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiPropertyOptional({ nullable: true })
  trackingNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  shippedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
