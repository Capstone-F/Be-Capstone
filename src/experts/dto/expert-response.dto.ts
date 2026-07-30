import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpertSpecialty } from '../expert-specialty.enum';

export class ExpertClinicSummaryDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GlowScan District 1 Clinic' })
  name!: string;

  @ApiProperty({ example: '12 Nguyen Hue, District 1, Ho Chi Minh City' })
  address!: string;
}

export class ExpertResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Dr. Nguyen Van A', nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ example: 'expert@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'uuid' })
  clinicId!: string;

  @ApiProperty({ example: 'GlowScan Clinic' })
  clinicName!: string;

  @ApiProperty({ type: ExpertClinicSummaryDto })
  clinic!: ExpertClinicSummaryDto;

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

  @ApiPropertyOptional({
    example: 'https://placehold.co/400',
    nullable: true,
    description: 'Expert profile avatar URL',
  })
  avatarUrl!: string | null;

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
