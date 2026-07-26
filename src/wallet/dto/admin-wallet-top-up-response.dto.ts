import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminWalletTopUpResponseDto {
  @ApiProperty()
  walletId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'Balance after credit (bigint string)' })
  balanceVnd!: string;

  @ApiProperty()
  transactionId!: string;

  @ApiProperty({ description: 'Credited amount (bigint string)' })
  amountVnd!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;
}
