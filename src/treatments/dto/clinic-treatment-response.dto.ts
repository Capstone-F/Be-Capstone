import { ApiProperty } from '@nestjs/swagger';
import { TreatmentResponseDto } from './treatment-response.dto';

export class ClinicTreatmentEscrowDto {
  @ApiProperty({
    example: '500000',
    description: 'Gross escrow still HELD for this treatment (VND).',
  })
  heldVnd!: string;

  @ApiProperty({
    example: '500000',
    description: 'Gross escrow already RELEASED to the clinic wallet (VND).',
  })
  releasedVnd!: string;

  @ApiProperty({
    example: '0',
    description: 'Gross escrow REFUNDED to the customer (VND).',
  })
  refundedVnd!: string;
}

export class ClinicTreatmentResponseDto extends TreatmentResponseDto {
  @ApiProperty({ type: ClinicTreatmentEscrowDto })
  escrow!: ClinicTreatmentEscrowDto;
}

export class PaginatedClinicTreatmentsDto {
  @ApiProperty({ type: [ClinicTreatmentResponseDto] })
  items!: ClinicTreatmentResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
