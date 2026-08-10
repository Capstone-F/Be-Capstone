import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { StockImportFormStatus } from '../enums';

export class ListStockImportFormsQueryDto {
  @ApiPropertyOptional({
    enum: StockImportFormStatus,
    description: 'Filter by form status',
  })
  @IsOptional()
  @IsEnum(StockImportFormStatus)
  status?: StockImportFormStatus;

  @ApiPropertyOptional({ description: 'Filter by product variant UUID' })
  @IsOptional()
  @IsUUID()
  productVariantId?: string;

  @ApiPropertyOptional({ description: 'Filter by creator user UUID' })
  @IsOptional()
  @IsUUID()
  createdByUserId?: string;

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
