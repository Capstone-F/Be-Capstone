import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({
    example: 'Schedule conflict',
    description: 'Optional reason for cancellation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
