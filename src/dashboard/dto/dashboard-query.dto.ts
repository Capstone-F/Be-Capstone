import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum DashboardRange {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
}

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: DashboardRange,
    default: DashboardRange.THIRTY_DAYS,
  })
  @IsOptional()
  @IsEnum(DashboardRange)
  range?: DashboardRange;
}
