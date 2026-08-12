import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdvanceOrderCancellationDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 20,
    description:
      'How many pipeline stages to advance. Stops early at AWAITING_RETURN or a terminal status.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  steps?: number;
}
