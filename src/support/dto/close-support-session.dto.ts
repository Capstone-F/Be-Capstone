import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseSupportSessionDto {
  @ApiPropertyOptional({
    description: 'Optional reason for closing the session',
    example: 'Issue resolved',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
