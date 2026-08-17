import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LedgerAccount,
  TransactionStatus,
  TransactionType,
} from '../../commerce/enums';

export class AdminTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ example: '45000' })
  amountVnd!: string;

  @ApiPropertyOptional({ enum: LedgerAccount, nullable: true })
  fromAccount!: LedgerAccount | null;

  @ApiPropertyOptional({ enum: LedgerAccount, nullable: true })
  toAccount!: LedgerAccount | null;

  @ApiPropertyOptional({ nullable: true })
  clinicId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Phòng khám Quận 1' })
  clinicName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Nguyễn Văn A' })
  userName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  orderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  consultationId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentPhaseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  escrowHoldId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  withdrawalId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expertId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  externalRef!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedAdminTransactionsDto {
  @ApiProperty({ type: [AdminTransactionResponseDto] })
  items!: AdminTransactionResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
