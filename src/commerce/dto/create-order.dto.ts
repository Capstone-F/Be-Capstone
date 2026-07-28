import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { ShippingAddressDto } from '../../delivery/dto/shipping-address.dto';

export class CreateOrderDto {
  @ApiProperty({
    type: ShippingAddressDto,
    description:
      'Where to ship. The GHN fee is quoted from this address and added to totalVnd.',
  })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}
