import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportSessionDto {
  @ApiPropertyOptional({
    description: 'Optional subject for the support session',
    example: 'Order delivery issue',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;
}
