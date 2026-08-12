import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderCancellationStatus } from '../enums';

export class ListOrderCancellationsQueryDto {
  @ApiPropertyOptional({
    enum: OrderCancellationStatus,
    description: 'Filter by cancellation pipeline status',
  })
  @IsOptional()
  @IsEnum(OrderCancellationStatus)
  status?: OrderCancellationStatus;

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
