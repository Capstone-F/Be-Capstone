import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpertSpecialty } from '../expert-specialty.enum';

export class ExpertResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Dr. Nguyen Van A', nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ example: 'expert@example.com', nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  clinicId!: string | null;

  @ApiPropertyOptional({ example: 'GlowScan Clinic', nullable: true })
  clinicName!: string | null;

  @ApiProperty({
    enum: ExpertSpecialty,
    example: ExpertSpecialty.DERMATOLOGY,
  })
  specialization!: ExpertSpecialty;

  @ApiPropertyOptional({ example: 'LIC-12345', nullable: true })
  licenseNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiProperty({ example: 4.5 })
  rating!: number;

  @ApiProperty({ example: 300000 })
  consultationFee!: number;

  @ApiPropertyOptional({
    example: 2.4,
    nullable: true,
    description:
      'Distance in km from client location (list only, when lat/lng provided)',
  })
  distanceKm!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedExpertsDto {
  @ApiProperty({ type: [ExpertResponseDto] })
  items!: ExpertResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
