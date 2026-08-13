import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdatePlatformCommissionDto {
  @ApiProperty({ example: 10, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}

export class PlatformCommissionSettingDto {
  @ApiProperty({ example: 10 })
  percent!: number;
}
