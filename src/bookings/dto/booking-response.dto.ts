import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationStatus } from '../../consultations/enums';
import { ExpertSpecialty } from '../../experts/expert-specialty.enum';

export class BookingClinicSummaryDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GlowScan District 1 Clinic' })
  name!: string;

  @ApiProperty({ example: '12 Nguyen Hue, District 1, Ho Chi Minh City' })
  address!: string;
}

export class BookingFeedbackSummaryDto {
  @ApiProperty({ example: 5 })
  rating!: number;

  @ApiPropertyOptional({ example: 'Great consultation', nullable: true })
  comment!: string | null;
}

export class BookingResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  customerId!: string;

  @ApiProperty({ example: 'uuid' })
  expertId!: string;

  @ApiPropertyOptional({ example: 'Dr. Nguyen Van A', nullable: true })
  expertName!: string | null;

  @ApiPropertyOptional({
    enum: ExpertSpecialty,
    example: ExpertSpecialty.DERMATOLOGY,
    nullable: true,
  })
  expertSpecialization!: ExpertSpecialty | null;

  @ApiPropertyOptional({ type: BookingClinicSummaryDto, nullable: true })
  clinic!: BookingClinicSummaryDto | null;

  @ApiPropertyOptional({ example: 'Jane Doe', nullable: true })
  customerName!: string | null;

  @ApiPropertyOptional({ example: 'I have persistent acne', nullable: true })
  reason!: string | null;

  @ApiProperty({
    enum: ConsultationStatus,
    example: ConsultationStatus.PENDING,
  })
  status!: ConsultationStatus;

  @ApiPropertyOptional({ example: '2026-07-07T09:00:00.000Z', nullable: true })
  scheduledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ type: BookingFeedbackSummaryDto, nullable: true })
  feedback!: BookingFeedbackSummaryDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedBookingsDto {
  @ApiProperty({ type: [BookingResponseDto] })
  items!: BookingResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
