import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';
import { DeliveryType } from '../enums';

export class AttachDeliveryDto {
  @ApiProperty({
    description: 'Delivery provider id from GET /delivery/options',
  })
  @IsUUID()
  providerId!: string;

  @ApiProperty({ enum: DeliveryType, example: DeliveryType.STANDARD })
  @IsEnum(DeliveryType)
  type!: DeliveryType;

  @ApiProperty({
    example: '123 Nguyen Hue, Quan 1, TP. Ho Chi Minh',
    minLength: 5,
  })
  @IsString()
  @MinLength(5)
  shippingAddress!: string;
}
