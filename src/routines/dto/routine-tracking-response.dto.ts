import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CheckInMood,
  DayHistoryStatus,
  EmptyRoutineReason,
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  SessionState,
  SideEffectType,
  SkipReason,
  StepSessionStatus,
  StockWarningLevel,
} from '../enums';
import { RoutineStepProductVariantDto } from './routine-response.dto';

export class RoutineProgressDto {
  @ApiProperty()
  completedCount!: number;

  @ApiProperty()
  skippedCount!: number;

  @ApiProperty()
  totalCount!: number;

  @ApiProperty({
    description:
      'completedCount / totalCount * 100. Skips do not inflate this rate.',
  })
  completionRate!: number;
}

export class TodayStepDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RoutinePeriod })
  period!: RoutinePeriod;

  @ApiProperty()
  stepOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  instructions!: string | null;

  @ApiPropertyOptional({ nullable: true })
  waitMinutes!: number | null;

  @ApiPropertyOptional({ nullable: true })
  dosageText!: string | null;

  @ApiPropertyOptional({ nullable: true })
  amountMl!: number | null;

  @ApiPropertyOptional({ nullable: true })
  protocolId!: string | null;

  @ApiPropertyOptional({ type: RoutineStepProductVariantDto, nullable: true })
  productVariant!: RoutineStepProductVariantDto | null;

  @ApiPropertyOptional({
    enum: StockWarningLevel,
    nullable: true,
    description:
      'LOW when daysLeft ≤5; EMPTY when depleted. null when estimate unavailable or daysLeft >5.',
  })
  warning!: StockWarningLevel | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Estimated remaining ml for this step share; null when estimate unavailable',
  })
  remainingMl!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Estimated whole days of scheduled use left for this variant; null when estimate unavailable',
  })
  daysLeft!: number | null;

  @ApiProperty({ enum: StepSessionStatus })
  status!: StepSessionStatus;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ enum: SkipReason, nullable: true })
  skipReason!: SkipReason | null;

  @ApiPropertyOptional({ nullable: true })
  skipNote!: string | null;
}

export class TodayRoutineDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: RoutineType })
  type!: RoutineType;

  @ApiProperty({ enum: RoutineStatus })
  status!: RoutineStatus;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: SessionState })
  sessionState!: SessionState;

  @ApiProperty({ type: RoutineProgressDto })
  progress!: RoutineProgressDto;

  @ApiProperty({ type: [TodayStepDto] })
  steps!: TodayStepDto[];
}

export class TodayRoutinesResponseDto {
  @ApiProperty({ description: 'YYYY-MM-DD in Asia/Ho_Chi_Minh' })
  date!: string;

  @ApiProperty({ enum: RoutinePeriod })
  period!: RoutinePeriod;

  @ApiProperty({
    enum: SessionState,
    description:
      'EMPTY when no ACTIVE routines. Otherwise NOT_STARTED if all not started, COMPLETED if all completed, else IN_PROGRESS. Session COMPLETED means every step is COMPLETED or SKIPPED.',
  })
  sessionState!: SessionState;

  @ApiPropertyOptional({ enum: EmptyRoutineReason })
  reason?: EmptyRoutineReason;

  @ApiProperty({ type: [TodayRoutineDto] })
  routines!: TodayRoutineDto[];
}

export class SideEffectResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SideEffectType })
  type!: SideEffectType;

  @ApiPropertyOptional({ nullable: true })
  severity!: number | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;
}

export class CheckInResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  routineId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  checkInDate!: string;

  @ApiProperty({ enum: RoutinePeriod })
  period!: RoutinePeriod;

  @ApiPropertyOptional({ enum: CheckInMood, nullable: true })
  overallMood!: CheckInMood | null;

  @ApiPropertyOptional({ nullable: true })
  acneLevel!: number | null;

  @ApiPropertyOptional({ nullable: true })
  oilLevel!: number | null;

  @ApiPropertyOptional({ nullable: true })
  rednessLevel!: number | null;

  @ApiPropertyOptional({ nullable: true })
  moistureLevel!: number | null;

  @ApiPropertyOptional({ nullable: true })
  completionRate!: number | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty({ type: [SideEffectResponseDto] })
  sideEffects!: SideEffectResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}

export class HistoryDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ enum: DayHistoryStatus })
  status!: DayHistoryStatus;

  @ApiProperty({
    description:
      'Day completion rate (completed steps / total steps across periods with steps)',
  })
  completionRate!: number;
}

export class HistorySummaryDto {
  @ApiProperty()
  currentStreak!: number;

  @ApiProperty()
  averageCompletionRate!: number;
}

export class RoutineHistoryResponseDto {
  @ApiProperty()
  routineId!: string;

  @ApiProperty({ type: [HistoryDayDto] })
  days!: HistoryDayDto[];

  @ApiProperty({ type: HistorySummaryDto })
  summary!: HistorySummaryDto;
}

export class HistoryDayDetailResponseDto {
  @ApiProperty()
  date!: string;

  @ApiProperty({ enum: RoutinePeriod })
  period!: RoutinePeriod;

  @ApiProperty({ enum: DayHistoryStatus })
  status!: DayHistoryStatus;

  @ApiProperty({ type: RoutineProgressDto })
  progress!: RoutineProgressDto;

  @ApiProperty({ type: [TodayStepDto] })
  steps!: TodayStepDto[];

  @ApiPropertyOptional({ type: CheckInResponseDto, nullable: true })
  checkIn!: CheckInResponseDto | null;
}
