import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ImportBatchDto {
  @ApiProperty({ description: 'Product variant UUID' })
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ description: 'Quantity to import', example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    description: 'Manufacturing date (ISO date)',
    example: '2026-01-15',
  })
  @IsDateString()
  manufacturingDate!: string;

  @ApiPropertyOptional({
    description: 'Supplier/lot batch code',
    example: 'LOT-2026-001',
  })
  @IsOptional()
  @IsString()
  batchCode?: string;
}
