import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class TickBookingExpiryDto {
  @ApiPropertyOptional({
    description:
      'Restrict the sweep to one booking. Required when ignoreDeadline is true.',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Cancel the booking without waiting out the confirm/no-show window. ' +
      'Ignored unless bookingId is set, so a demo cannot wipe every pending booking.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const v = String(value).toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  })
  @IsBoolean()
  ignoreDeadline?: boolean;
}

export class TickBookingExpiryResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Booking ids cancelled because the expert never confirmed.',
  })
  confirmTimedOut!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Booking ids cancelled because the expert never started the session.',
  })
  expertNoShow!: string[];

  @ApiProperty({
    example: 0,
    description: 'Candidates a racing manual action claimed first.',
  })
  skipped!: number;
}
