import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentClient } from '../../payments/enums';

export class WalletTopUpDto {
  @ApiProperty({ example: 200000, description: 'Top-up amount in VND' })
  @Type(() => Number)
  @IsInt()
  @Min(10000)
  amountVnd!: number;

  @ApiPropertyOptional({
    enum: PaymentClient,
    default: PaymentClient.WEB,
    description:
      'Selects which clientReturnUrl the gateway return redirects to',
  })
  @IsOptional()
  @IsEnum(PaymentClient)
  client?: PaymentClient;

  @ApiPropertyOptional({
    description:
      'Custom mobile deep link return URL (e.g. glowscan://vnpay-return)',
  })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
