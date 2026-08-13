import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ShippingAddressDto } from '../../delivery/dto/shipping-address.dto';

export class CreateOrderDto {
  @ApiProperty({
    required: false,
    format: 'uuid',
    description:
      'Opaque first-party analytics session used to attribute purchase conversion.',
  })
  @IsOptional()
  @IsUUID()
  analyticsSessionId?: string;

  @ApiProperty({
    type: ShippingAddressDto,
    description:
      'Where to ship. The GHN fee is quoted from this address and added to totalVnd.',
  })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}
