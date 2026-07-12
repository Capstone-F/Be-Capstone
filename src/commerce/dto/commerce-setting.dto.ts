import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateComboDiscountDto {
  @ApiProperty({ example: 15, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}

export class ComboDiscountSettingDto {
  @ApiProperty({ example: 10 })
  percent!: number;

  @ApiProperty({ example: 'SURVEY_COMBO_DISCOUNT_PCT' })
  key!: string;
}
