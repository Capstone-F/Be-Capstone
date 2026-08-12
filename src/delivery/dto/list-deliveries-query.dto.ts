import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DeliveryStatus } from '../enums';

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({
    enum: DeliveryStatus,
    description: 'Filter by delivery status',
  })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional({ description: 'Filter by order id' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({
    description:
      'When true, only deliveries with a null providerOrderCode (GHN create failed / not yet run).',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const v = String(value).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  })
  @IsBoolean()
  missingProviderCode?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, only PROCESSING deliveries that have a providerOrderCode but have not been handed over yet (staff pack-and-ship queue).',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const v = String(value).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  })
  @IsBoolean()
  awaitingHandover?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
