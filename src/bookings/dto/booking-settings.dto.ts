import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class BookingSettingsDto {
  @ApiProperty({
    example: 1440,
    description:
      'Minutes a PENDING booking waits for expert confirm before auto-cancel + refund. ' +
      'The slot start time is always a second, earlier deadline.',
  })
  confirmTimeoutMin!: number;

  @ApiProperty({
    example: 15,
    description:
      'Minutes after the slot start a CONFIRMED booking may stay un-started before it is cancelled as an expert no-show.',
  })
  noShowGraceMin!: number;

  @ApiProperty({
    example: 120,
    description:
      'Minimum minutes between booking creation and the slot start. 0 disables the lead-time check.',
  })
  minLeadTimeMin!: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Cross-key conflict notes (e.g. late-cancel threshold vs minimum lead ' +
      'time). Informational — the values are stored regardless.',
  })
  warnings?: string[];
}

export class UpdateBookingSettingsDto {
  @ApiPropertyOptional({ example: 1440, minimum: 1, maximum: 10080 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  confirmTimeoutMin?: number;

  @ApiPropertyOptional({ example: 15, minimum: 0, maximum: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  noShowGraceMin?: number;

  @ApiPropertyOptional({
    example: 120,
    minimum: 0,
    maximum: 1440,
    description: '0 disables the lead-time check',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  minLeadTimeMin?: number;
}
