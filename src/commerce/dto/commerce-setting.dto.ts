import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateComboDiscountDto {
  @ApiPropertyOptional({ example: 15, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({
    example: 300000,
    minimum: 0,
    description:
      'Minimum order subtotal (VND) to unlock the survey combo discount',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minSubtotalVnd?: number;
}

export class ComboDiscountSettingDto {
  @ApiProperty({ example: 10 })
  percent!: number;

  @ApiProperty({
    example: 300000,
    description:
      'Minimum order subtotal (VND) to unlock the survey combo discount',
  })
  minSubtotalVnd!: number;
}
