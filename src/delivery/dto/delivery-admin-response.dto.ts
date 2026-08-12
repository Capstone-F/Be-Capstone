import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus, DeliveryType } from '../enums';
import { DeliveryStatusEventDto } from './delivery-response.dto';

export class DeliveryAdminResponseDto {
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
    description: 'GHN order_code. Null until GHN order is created.',
  })
  providerOrderCode!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Raw GHN status string, e.g. delivering.',
  })
  providerStatus!: string | null;

  @ApiProperty()
  shippingFeeVnd!: number;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryTime!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  shippedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  deliveredAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Timestamp of the last applied status event.',
  })
  lastStatusAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'When staff confirmed the parcel was handed to the carrier. Null until handover.',
  })
  handedOverAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'User id of the staff member who confirmed handover.',
  })
  handedOverByUserId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional note recorded at handover.',
  })
  handoverNote!: string | null;

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

export class PaginatedDeliveriesDto {
  @ApiProperty({ type: [DeliveryAdminResponseDto] })
  items!: DeliveryAdminResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class DeliveryTransitionDto {
  @ApiProperty()
  deliveryId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({ description: 'Raw GHN status that was applied.' })
  providerStatus!: string;

  @ApiPropertyOptional({
    nullable: true,
    enum: DeliveryStatus,
    description: 'Mapped internal delivery status.',
  })
  deliveryStatus!: DeliveryStatus | null;
}

export class TickDeliverySimulationResponseDto {
  @ApiProperty({ type: [DeliveryTransitionDto] })
  advanced!: DeliveryTransitionDto[];

  @ApiProperty()
  skipped!: number;
}

export class AdvanceDeliveryResponseDto {
  @ApiProperty({ type: DeliveryAdminResponseDto })
  delivery!: DeliveryAdminResponseDto;

  @ApiProperty({ type: [DeliveryTransitionDto] })
  transitions!: DeliveryTransitionDto[];
}

export class ForceDeliveryStatusResponseDto {
  @ApiProperty({ type: DeliveryAdminResponseDto })
  delivery!: DeliveryAdminResponseDto;

  @ApiProperty()
  applied!: boolean;

  @ApiPropertyOptional({ nullable: true, enum: DeliveryStatus })
  deliveryStatus!: DeliveryStatus | null;
}

export class CreateGhnOrderResponseDto {
  @ApiProperty({ type: DeliveryAdminResponseDto })
  delivery!: DeliveryAdminResponseDto;

  @ApiProperty({
    description: 'True when providerOrderCode is now set.',
  })
  created!: boolean;
}
