import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdvanceDeliveryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 20,
    description:
      'How many happy-path GHN statuses to advance. Stops early at delivered or off-sequence.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  steps?: number;
}
