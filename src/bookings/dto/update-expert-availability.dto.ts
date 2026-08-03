import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateExpertAvailabilityDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday .. 6 = Saturday (Vietnam local day-of-week)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    example: 9,
    minimum: 9,
    maximum: 19,
    description: 'Inclusive start hour (GMT+7); business hours 09–20',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(9)
  @Max(19)
  startHour?: number;

  @ApiPropertyOptional({
    example: 12,
    minimum: 10,
    maximum: 20,
    description:
      'Exclusive end hour (GMT+7); must be greater than startHour; max 20',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(20)
  endHour?: number;
}
