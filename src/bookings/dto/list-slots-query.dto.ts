import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { BookingRange } from '../enums';

export class ListSlotsQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-07',
    description: 'Anchor date (ISO YYYY-MM-DD). Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    enum: BookingRange,
    default: BookingRange.WEEK,
    description:
      'Return slots for the week or month containing the anchor date.',
  })
  @IsOptional()
  @IsEnum(BookingRange)
  range?: BookingRange;
}
