import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class TickDeliverySimulationDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'When true, ignore the step delay and advance every eligible delivery immediately.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const v = String(value).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  })
  @IsBoolean()
  ignoreDelay?: boolean;
}
