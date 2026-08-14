import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockWarningLevel } from '../../routines/enums';

export class DemoCredentialsDto {
  @ApiProperty({ description: 'Keycloak username and login email' })
  email!: string;

  @ApiProperty({ description: 'Plain-text password, shown once for the demo' })
  password!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  keycloakSub!: string;
}

export class DemoRoutineSummaryDto {
  @ApiProperty()
  routineId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    description: 'VN date the routine was backdated to (first calendar day)',
  })
  activeFromDate!: string;

  @ApiProperty()
  morningSteps!: number;

  @ApiProperty()
  eveningSteps!: number;

  @ApiProperty({ description: 'PAID order the routine was generated from' })
  sourceOrderId!: string;
}

export class DemoHistorySummaryDto {
  @ApiProperty({ description: 'Days with every step recorded COMPLETED' })
  completedDays!: number;

  @ApiProperty({ description: 'Days left untouched → MISSED on the calendar' })
  missedDays!: number;

  @ApiProperty({ description: 'Consecutive COMPLETED days ending yesterday' })
  currentStreak!: number;

  @ApiProperty()
  checkInCount!: number;

  @ApiProperty({ description: 'Oldest seeded date, YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ description: 'Newest seeded date (yesterday), YYYY-MM-DD' })
  to!: string;
}

export class DemoLowStockProductDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ description: 'Bottle size in ml' })
  bottleMl!: number;

  @ApiProperty({ description: 'Planned ml per day across the linked steps' })
  dailyMl!: number;

  @ApiPropertyOptional({ nullable: true })
  remainingMl!: number | null;

  @ApiPropertyOptional({ nullable: true })
  daysLeft!: number | null;

  @ApiProperty({
    enum: StockWarningLevel,
    description: 'Warning the customer will see on GET /routines/me/today',
  })
  warning!: StockWarningLevel;

  @ApiProperty({
    type: [String],
    description: 'Routine steps carrying this warning',
  })
  stepIds!: string[];
}

export class SeedDemoCustomerResponseDto {
  @ApiProperty({ type: DemoCredentialsDto })
  credentials!: DemoCredentialsDto;

  @ApiProperty({ type: DemoRoutineSummaryDto })
  routine!: DemoRoutineSummaryDto;

  @ApiProperty({ type: DemoHistorySummaryDto })
  history!: DemoHistorySummaryDto;

  @ApiProperty({ type: DemoLowStockProductDto })
  lowStock!: DemoLowStockProductDto;

  @ApiProperty({
    type: [String],
    description: 'Suggested request order for walking through the demo',
  })
  nextSteps!: string[];
}
