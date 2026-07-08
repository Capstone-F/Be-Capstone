import { ApiProperty } from '@nestjs/swagger';

export class CheckoutResponseDto {
  @ApiProperty({ description: 'Id of the created Payment' })
  paymentId: string;

  @ApiProperty({ description: 'VNPay payment URL to redirect the customer to' })
  paymentUrl: string;
}
