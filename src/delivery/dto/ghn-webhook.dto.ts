import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * GHN status callback body. Source: https://api.ghn.vn/home/docs/detail?id=47
 *
 * Only the three fields we act on are declared as required. GHN sends five payload
 * shapes (Create | Switch_status | Update_weight | Update_cod | Update_fee) with
 * differing fields; a validation failure would 400 and trigger GHN's 10x/5s retry.
 *
 * The global ValidationPipe uses `whitelist: true`, so every field NOT declared here
 * is stripped from this object. The full untouched payload is therefore read off the
 * raw request for the audit trail — do not rely on this DTO to carry GHN's money or
 * parcel fields.
 *
 * Nothing from this body is trusted for financial decisions: the endpoint is
 * unauthenticated because GHN does not sign its callbacks.
 */
export class GhnWebhookDto {
  @ApiProperty({ description: 'GHN order_code.' })
  @IsString()
  @IsNotEmpty()
  OrderCode: string;

  @ApiProperty({ description: 'GHN shipping status, e.g. delivering.' })
  @IsString()
  @IsNotEmpty()
  Status: string;

  @ApiProperty({ description: 'When the event occurred, ISO 8601.' })
  @IsISO8601()
  Time: string;

  @ApiPropertyOptional({ description: 'Echo of our Order.id.' })
  @IsOptional()
  @IsString()
  ClientOrderCode?: string;

  @ApiPropertyOptional({
    description:
      'Create | Switch_status | Update_weight | Update_cod | Update_fee',
  })
  @IsOptional()
  @IsString()
  Type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ReasonCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Warehouse?: string;
}
