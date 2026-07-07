import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ConsultationStatus } from '../../consultations/enums';
import { BookingPerspective } from '../enums';

export class ListBookingsQueryDto {
  @ApiPropertyOptional({
    enum: ConsultationStatus,
    description: 'Filter by consultation status',
  })
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  @ApiPropertyOptional({
    enum: BookingPerspective,
    description:
      'View bookings as customer (requests you made) or expert (requests assigned to you). ' +
      'Defaults to customer if the caller has that role, otherwise expert.',
  })
  @IsOptional()
  @IsEnum(BookingPerspective)
  as?: BookingPerspective;

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
