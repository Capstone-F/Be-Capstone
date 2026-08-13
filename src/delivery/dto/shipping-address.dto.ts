import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * A GHN-compatible shipping address. provinceId/districtId/wardCode must come from the
 * GHN master-data endpoints (GET /delivery/provinces, /districts, /wards) — free text
 * cannot be turned into a valid GHN order.
 */
export class ShippingAddressDto {
  @ApiProperty({ example: 'Nguyen Van A', maxLength: 1024 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  recipientName: string;

  @ApiProperty({
    example: '0901234567',
    description: '10-digit Vietnamese phone',
  })
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'recipientPhone phải là số điện thoại Việt Nam gồm 10 chữ số',
  })
  recipientPhone: string;

  @ApiProperty({ example: 202, description: 'GHN ProvinceID' })
  @IsInt()
  @IsPositive()
  provinceId: number;

  @ApiProperty({
    example: 1442,
    description: 'GHN DistrictID (to_district_id)',
  })
  @IsInt()
  @IsPositive()
  districtId: number;

  @ApiProperty({ example: '21012', description: 'GHN WardCode (to_ward_code)' })
  @IsString()
  @IsNotEmpty()
  wardCode: string;

  @ApiProperty({ example: '123 Le Loi, Ben Nghe', maxLength: 1024 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  streetAddress: string;
}
