import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EscrowHoldStatus } from '../../finance/enums';
import { BookingResponseDto } from './booking-response.dto';

export class ClinicBookingResponseDto extends BookingResponseDto {
  @ApiPropertyOptional({
    enum: EscrowHoldStatus,
    nullable: true,
    description:
      'Escrow hold state for this booking (HELD until the session completes, ' +
      'then RELEASED to the clinic wallet, or REFUNDED on cancel). Null when no hold exists yet.',
  })
  escrowStatus!: EscrowHoldStatus | null;
}

export class PaginatedClinicBookingsDto {
  @ApiProperty({ type: [ClinicBookingResponseDto] })
  items!: ClinicBookingResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
