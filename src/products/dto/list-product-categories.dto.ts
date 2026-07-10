import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListProductCategoriesQueryDto {
  @ApiPropertyOptional({
    example: 'Serum',
    description: 'Filter by category name or code (case-insensitive substring)',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
