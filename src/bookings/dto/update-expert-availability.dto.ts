import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateExpertAvailabilityDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday .. 6 = Saturday (JS Date.getUTCDay())',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    example: 9,
    minimum: 0,
    maximum: 23,
    description: 'Inclusive start hour (UTC)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;

  @ApiPropertyOptional({
    example: 12,
    minimum: 1,
    maximum: 24,
    description: 'Exclusive end hour (UTC); must be greater than startHour',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  endHour?: number;
}
