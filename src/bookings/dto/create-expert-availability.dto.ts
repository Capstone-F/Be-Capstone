import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CreateExpertAvailabilityDto {
  @ApiProperty({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday .. 6 = Saturday (JS Date.getUTCDay())',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({
    example: 9,
    minimum: 0,
    maximum: 23,
    description: 'Inclusive start hour (UTC)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour!: number;

  @ApiProperty({
    example: 12,
    minimum: 1,
    maximum: 24,
    description: 'Exclusive end hour (UTC); must be greater than startHour',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  endHour!: number;
}
