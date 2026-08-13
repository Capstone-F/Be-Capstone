import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClinicWalletSummaryDto {
  @ApiProperty()
  clinicId!: string;

  @ApiProperty({
    example: '270000',
    description: 'Available balance (released funds only)',
  })
  balanceVnd!: string;

  @ApiProperty({
    example: '300000',
    description: 'Sum of HELD escrow for this clinic',
  })
  heldEscrowVnd!: string;

  @ApiProperty({
    example: '0',
    description: 'Sum of REQUESTED withdrawals (already deducted from balance)',
  })
  pendingWithdrawalsVnd!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  bankName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bankAccountNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bankAccountHolder!: string | null;
}
