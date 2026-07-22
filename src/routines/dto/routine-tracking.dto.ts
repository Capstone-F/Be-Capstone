import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CheckInMood,
  RoutinePeriod,
  SideEffectType,
  SkipReason,
} from '../enums';

export class SkipStepDto {
  @ApiProperty({ enum: SkipReason })
  @IsEnum(SkipReason)
  reason!: SkipReason;

  @ApiPropertyOptional({
    description: 'Required when reason is OTHER (enforced in service)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CheckInSideEffectDto {
  @ApiProperty({ enum: SideEffectType })
  @IsEnum(SideEffectType)
  type!: SideEffectType;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  severity?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class CreateCheckInDto {
  @ApiPropertyOptional({
    description:
      'YYYY-MM-DD in Asia/Ho_Chi_Minh. Defaults to today. Same-day only for MVP.',
    example: '2026-07-22',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  date?: string;

  @ApiPropertyOptional({ enum: RoutinePeriod })
  @IsOptional()
  @IsEnum(RoutinePeriod)
  period?: RoutinePeriod;

  @ApiPropertyOptional({ enum: CheckInMood })
  @IsOptional()
  @IsEnum(CheckInMood)
  overallMood?: CheckInMood;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  acneLevel?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  oilLevel?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  rednessLevel?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  moistureLevel?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ type: [CheckInSideEffectDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckInSideEffectDto)
  sideEffects?: CheckInSideEffectDto[];
}

export class TodayQueryDto {
  @ApiPropertyOptional({ enum: RoutinePeriod })
  @IsOptional()
  @IsEnum(RoutinePeriod)
  period?: RoutinePeriod;
}

export class DateRangeQueryDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  from!: string;

  @ApiProperty({ example: '2026-07-22' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  to!: string;
}

export class HistoryDayQueryDto {
  @ApiPropertyOptional({ enum: RoutinePeriod })
  @IsOptional()
  @IsEnum(RoutinePeriod)
  period?: RoutinePeriod;
}
