import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class LowStockThresholdDto {
  @ApiProperty({
    description:
      'Remaining units at or below which inventory items get a LOW restock warning',
    example: 10,
  })
  threshold!: number;
}

export class UpdateLowStockThresholdDto {
  @ApiProperty({ example: 10, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  threshold!: number;
}
