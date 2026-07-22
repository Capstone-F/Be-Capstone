import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClinicResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GlowScan District 1 Clinic' })
  name!: string;

  @ApiPropertyOptional({
    example: '12 Nguyen Hue, District 1, Ho Chi Minh City',
    nullable: true,
  })
  address!: string | null;

  @ApiPropertyOptional({ example: 10.7769, nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ example: 106.7009, nullable: true })
  longitude!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedClinicsDto {
  @ApiProperty({ type: [ClinicResponseDto] })
  items!: ClinicResponseDto[];

  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
