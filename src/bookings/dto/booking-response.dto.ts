import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingAutoCancelReason,
  BookingCancelledBy,
  ConsultationStatus,
} from '../../consultations/enums';
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

  @ApiPropertyOptional({
    example: '2026-07-07T09:00:00.000+07:00',
    nullable: true,
    description: 'ISO-8601 with fixed Asia/Ho_Chi_Minh (+07:00) offset',
  })
  scheduledAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ example: 'Schedule conflict', nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({
    enum: BookingCancelledBy,
    nullable: true,
  })
  cancelledBy!: BookingCancelledBy | null;

  @ApiPropertyOptional({
    enum: BookingAutoCancelReason,
    nullable: true,
    description:
      'Set only when cancelledBy = SYSTEM. CONFIRM_TIMEOUT = expert never confirmed; ' +
      'EXPERT_NO_SHOW = expert confirmed but never started after scheduledAt + grace.',
  })
  autoCancelReason!: BookingAutoCancelReason | null;

  @ApiProperty({
    description:
      'True when the customer may still POST /bookings/:id/feedback — COMPLETED, ' +
      'or CANCELLED with autoCancelReason = EXPERT_NO_SHOW, and no feedback yet.',
  })
  canSubmitFeedback!: boolean;

  @ApiPropertyOptional({ nullable: true })
  treatmentId!: string | null;

  @ApiPropertyOptional({
    description:
      'Fee charged in VND (0 when follow-up waived). Null until paid.',
    nullable: true,
  })
  feeChargedVnd!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidTransactionId!: string | null;

  @ApiProperty()
  isFollowUp!: boolean;

  @ApiPropertyOptional({
    description: 'True when fee is waived or wallet payment completed',
  })
  isPaid!: boolean;

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
