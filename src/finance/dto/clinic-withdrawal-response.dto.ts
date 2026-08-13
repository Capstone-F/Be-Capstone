import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicWithdrawalStatus } from '../enums';

export class ClinicWithdrawalResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty({ example: '500000' })
  amountVnd!: string;

  @ApiProperty({ enum: ClinicWithdrawalStatus })
  status!: ClinicWithdrawalStatus;

  @ApiProperty()
  requestedByUserId!: string;

  @ApiProperty()
  bankName!: string;

  @ApiProperty()
  bankAccountNumber!: string;

  @ApiProperty()
  bankAccountHolder!: string;

  @ApiPropertyOptional({ nullable: true })
  processedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  processedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  transferRef!: string | null;

  @ApiPropertyOptional({ nullable: true })
  staffNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  debitTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  refundTransactionId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedClinicWithdrawalsDto {
  @ApiProperty({ type: [ClinicWithdrawalResponseDto] })
  items!: ClinicWithdrawalResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
