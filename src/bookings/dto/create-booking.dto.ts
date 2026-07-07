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
    example: '2026-07-07T09:00:00.000Z',
    description: 'Requested slot start time (UTC, top of hour)',
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
