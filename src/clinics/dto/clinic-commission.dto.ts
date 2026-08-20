import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { ClinicResponseDto } from './clinic-response.dto';

export class UpdateClinicCommissionDto {
  @ApiProperty({ example: 10, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percent!: number;
}

export class AdminClinicResponseDto extends ClinicResponseDto {
  @ApiProperty({ example: 10, minimum: 0, maximum: 100 })
  commissionPercent!: number;
}

export class PaginatedAdminClinicsDto {
  @ApiProperty({ type: [AdminClinicResponseDto] })
  items!: AdminClinicResponseDto[];

  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
