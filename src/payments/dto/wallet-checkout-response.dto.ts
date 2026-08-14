import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '../enums';

export class WalletCheckoutResponseDto {
  @ApiProperty({ description: 'Id of the created Payment' })
  paymentId: string;

  @ApiProperty({ description: 'Id of the paid order' })
  orderId: string;

  @ApiProperty({
    enum: PaymentStatus,
    description: 'Always PAID — the wallet settles synchronously',
  })
  status: PaymentStatus;

  @ApiProperty({ description: 'Amount charged to the wallet, in VND' })
  amountVnd: string;

  @ApiProperty({ description: 'Id of the wallet debit ledger transaction' })
  transactionId: string;

  @ApiProperty({ description: 'Wallet balance after the debit, in VND' })
  walletBalanceVnd: string;

  @ApiProperty({ description: 'When the wallet debit settled' })
  paidAt: Date;
}
