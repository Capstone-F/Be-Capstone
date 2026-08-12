import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderCancellationActor,
  OrderCancellationStatus,
  OrderStatus,
} from '../enums';

export class OrderCancellationItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderItemId!: string;

  @ApiProperty()
  expectedQuantity!: number;

  @ApiPropertyOptional({ nullable: true })
  goodQuantity!: number | null;

  @ApiPropertyOptional({ nullable: true })
  damagedQuantity!: number | null;
}

export class OrderCancellationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: OrderCancellationStatus })
  status!: OrderCancellationStatus;

  @ApiProperty()
  requestedByUserId!: string;

  @ApiProperty({ enum: OrderCancellationActor })
  requestedByActor!: OrderCancellationActor;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty({ enum: OrderStatus })
  orderStatusAtRequest!: OrderStatus;

  @ApiProperty({ description: 'Refund amount in VND (bigint string)' })
  refundAmountVnd!: string;

  @ApiPropertyOptional({ nullable: true })
  refundTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  refundedAt!: Date | null;

  @ApiProperty()
  requiresStockReturn!: boolean;

  @ApiPropertyOptional({ nullable: true })
  restockConfirmedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  restockConfirmedAt!: Date | null;

  @ApiProperty()
  nextRunAt!: Date;

  @ApiProperty()
  attempts!: number;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiProperty({ type: [OrderCancellationItemResponseDto] })
  items!: OrderCancellationItemResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedOrderCancellationsDto {
  @ApiProperty({ type: [OrderCancellationResponseDto] })
  items!: OrderCancellationResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class CancellationTransitionDto {
  @ApiProperty()
  cancellationId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: OrderCancellationStatus })
  from!: OrderCancellationStatus;

  @ApiProperty({ enum: OrderCancellationStatus })
  to!: OrderCancellationStatus;
}

export class AdvanceOrderCancellationResponseDto {
  @ApiProperty({ type: OrderCancellationResponseDto })
  cancellation!: OrderCancellationResponseDto;

  @ApiProperty({ type: [CancellationTransitionDto] })
  transitions!: CancellationTransitionDto[];
}

export class TickOrderCancellationsResponseDto {
  @ApiProperty({ type: [CancellationTransitionDto] })
  advanced!: CancellationTransitionDto[];

  @ApiProperty()
  skipped!: number;
}

export class OrderCancellationSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: OrderCancellationStatus })
  status!: OrderCancellationStatus;

  @ApiProperty({ description: 'Refund amount in VND (bigint string)' })
  refundAmountVnd!: string;

  @ApiPropertyOptional({ nullable: true })
  refundTransactionId!: string | null;

  @ApiProperty()
  requiresStockReturn!: boolean;

  @ApiProperty()
  nextRunAt!: Date;
}
