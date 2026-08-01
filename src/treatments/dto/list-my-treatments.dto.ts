import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum DateSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListMyTreatmentsQueryDto {
  @ApiPropertyOptional({
    enum: ['customer', 'expert'],
    description: 'Perspective when the user has both roles',
  })
  @IsOptional()
  @IsIn(['customer', 'expert'])
  as?: 'customer' | 'expert';

  @ApiPropertyOptional({
    example: 'acne',
    description:
      'Expert view only. Case-insensitive search across treatment title, description, and customer name/email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    enum: DateSortOrder,
    default: DateSortOrder.DESC,
    description: 'Expert view only. Sort by treatment createdAt',
  })
  @IsOptional()
  @IsEnum(DateSortOrder)
  dateOrder?: DateSortOrder;

  @ApiPropertyOptional({
    example: 3,
    minimum: 0,
    description:
      'Expert view only. Filter to treatments with exactly this many phases',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  phaseCount?: number;
}
