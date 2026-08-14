import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus, TransactionType } from '../../commerce/enums';
import { WalletTransactionDirection } from '../enums';

export class WalletTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({
    enum: WalletTransactionDirection,
    description: 'CREDIT = money in, DEBIT = money out',
  })
  direction!: WalletTransactionDirection;

  @ApiProperty({ example: '300000', description: 'Absolute amount in VND' })
  amountVnd!: string;

  @ApiPropertyOptional({ nullable: true })
  orderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  consultationId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentPhaseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expertId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedWalletTransactionsDto {
  @ApiProperty({ type: [WalletTransactionResponseDto] })
  items!: WalletTransactionResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
