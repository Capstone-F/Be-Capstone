import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DEMO_HISTORY_DAYS_DEFAULT,
  DEMO_HISTORY_DAYS_MAX,
  DEMO_HISTORY_DAYS_MIN,
} from '../demo-customer.plan';

export class SeedDemoCustomerDto {
  @ApiPropertyOptional({
    description:
      'Login email. Defaults to a unique demo.customer.<random>@glowscan.local address.',
    example: 'demo.tracking@glowscan.local',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Login password. Defaults to the seeded demo password.',
    example: 'P@ssw0rd',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({
    description: 'Display name of the demo customer.',
    example: 'Demo Tracking Customer',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({
    description:
      'How many past days of routine history to seed. The routine is backdated by the same number of days.',
    minimum: DEMO_HISTORY_DAYS_MIN,
    maximum: DEMO_HISTORY_DAYS_MAX,
    default: DEMO_HISTORY_DAYS_DEFAULT,
  })
  @IsOptional()
  @IsInt()
  @Min(DEMO_HISTORY_DAYS_MIN)
  @Max(DEMO_HISTORY_DAYS_MAX)
  historyDays?: number;
}
