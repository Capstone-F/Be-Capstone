import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'uuid', description: 'Expert to book with' })
  @IsUUID()
  expertId!: string;

  @ApiProperty({
    example: '2026-07-07T09:00:00.000+07:00',
    description:
      'Requested slot start time (Asia/Ho_Chi_Minh GMT+7, top of hour). Prefer the exact startAt from GET /bookings/:expertId.',
  })
  @IsISO8601()
  scheduledAt!: string;

  @ApiPropertyOptional({
    example: 'I have persistent acne on my cheeks',
    description: 'Reason for the consultation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
