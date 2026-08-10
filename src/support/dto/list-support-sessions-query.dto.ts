import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupportSessionAssignedFilter, SupportSessionStatus } from '../enums';

export class ListSupportSessionsQueryDto {
  @ApiPropertyOptional({
    enum: SupportSessionStatus,
    description: 'Filter by session status',
  })
  @IsOptional()
  @IsEnum(SupportSessionStatus)
  status?: SupportSessionStatus;

  @ApiPropertyOptional({
    enum: SupportSessionAssignedFilter,
    description:
      'Filter by assignment: me (assigned to caller), unassigned, or any',
    default: SupportSessionAssignedFilter.Any,
  })
  @IsOptional()
  @IsEnum(SupportSessionAssignedFilter)
  assigned?: SupportSessionAssignedFilter;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
