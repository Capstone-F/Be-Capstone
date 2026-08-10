import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectStockImportFormDto {
  @ApiPropertyOptional({
    description: 'Optional reason for rejecting the form',
    example: 'Incorrect manufacturing date',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
