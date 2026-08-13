import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateClinicBankAccountDto {
  @ApiProperty({ example: 'Vietcombank' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName!: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  bankAccountNumber!: string;

  @ApiProperty({ example: 'GlowScan District 1 Clinic' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bankAccountHolder!: string;
}

export class RequestClinicWithdrawalDto {
  @ApiProperty({ example: 500000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountVnd!: number;
}

export class MarkWithdrawalPaidDto {
  @ApiPropertyOptional({ example: 'FT123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transferRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectWithdrawalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
