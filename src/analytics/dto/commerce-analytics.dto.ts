import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderSource } from '../../commerce/enums';
import { ClientCommerceAnalyticsEventType } from '../commerce-analytics.enums';

export class CommerceAnalyticsEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ enum: ClientCommerceAnalyticsEventType })
  @IsEnum(ClientCommerceAnalyticsEventType)
  eventType!: ClientCommerceAnalyticsEventType;

  @ApiProperty({ enum: OrderSource })
  @IsEnum(OrderSource)
  source!: OrderSource;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  productVariantId?: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  path?: string;

  @ApiProperty({ example: '2026-08-13T08:00:00.000Z' })
  @IsDateString()
  occurredAt!: string;
}

export class CommerceAnalyticsBatchDto {
  @ApiProperty({ type: [CommerceAnalyticsEventDto], maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CommerceAnalyticsEventDto)
  events!: CommerceAnalyticsEventDto[];
}

export class CommerceAnalyticsBatchResponseDto {
  @ApiProperty() accepted!: number;
}
