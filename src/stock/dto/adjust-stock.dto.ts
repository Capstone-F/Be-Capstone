import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({
    description: 'New absolute remaining quantity for the batch',
    example: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Reason or reference for the adjustment',
    example: 'Physical inventory count correction',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
