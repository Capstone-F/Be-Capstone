import { ApiProperty } from '@nestjs/swagger';

export class WalletBalanceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'Balance in VND (bigint string)' })
  balanceVnd!: string;

  @ApiProperty()
  isActive!: boolean;
}
