import { ApiProperty } from '@nestjs/swagger';
import { DeliveryType } from '../enums';

export class DeliveryOptionDto {
  @ApiProperty()
  providerId!: string;

  @ApiProperty({ example: 'GHN' })
  providerCode!: string;

  @ApiProperty({ example: 'Giao Hàng Nhanh' })
  providerName!: string;

  @ApiProperty({ enum: DeliveryType })
  type!: DeliveryType;

  @ApiProperty({ example: 30000 })
  feeVnd!: number;
}
