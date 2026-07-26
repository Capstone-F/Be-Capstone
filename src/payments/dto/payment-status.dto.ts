import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider, PaymentStatus } from '../enums';

export class PaymentStatusDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  orderId: string | null;

  @ApiProperty({ enum: ['ORDER', 'WALLET_TOPUP'] })
  purpose: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentProvider })
  provider: PaymentProvider;

  @ApiProperty({ description: 'Amount in VND (stored as bigint string)' })
  amountVnd: string;

  @ApiPropertyOptional({ type: Date, nullable: true })
  paidAt: Date | null;
}
