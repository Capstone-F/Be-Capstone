import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminWalletTopUpDto {
  @ApiProperty({ example: 500000, description: 'Amount to credit in VND' })
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  amountVnd!: number;

  @ApiPropertyOptional({
    example: 'Support credit for testing',
    description: 'Optional note stored on the ledger transaction',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
