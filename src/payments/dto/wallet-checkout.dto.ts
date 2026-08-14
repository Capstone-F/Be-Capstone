import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class WalletCheckoutDto {
  @ApiProperty({
    description: 'Id of the PENDING order to pay for with the customer wallet',
  })
  @IsUUID()
  orderId: string;
}
