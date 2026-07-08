import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentClient } from '../enums';

export class CheckoutDto {
  @ApiProperty({ description: 'Id of the PENDING order to pay for' })
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({
    enum: PaymentClient,
    default: PaymentClient.WEB,
    description:
      'Client that initiated checkout; selects the URL VNPay returns the user to. Defaults to web.',
  })
  @IsOptional()
  @IsEnum(PaymentClient)
  client?: PaymentClient;
}
