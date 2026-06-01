import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdjustStockDto {
  @ApiProperty({
    description: 'New absolute remaining quantity for the batch',
    example: 50,
  })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Reason or reference for the adjustment',
    example: 'Physical inventory count correction',
  })
  note?: string;
}
