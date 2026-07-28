import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { ShippingAddressDto } from './shipping-address.dto';

export class FeeQuoteRequestDto {
  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}

export class FeeQuoteResponseDto {
  @ApiProperty({ example: 32000, description: 'GHN shipping fee in VND' })
  shippingFeeVnd: number;
}
