import { ApiProperty } from '@nestjs/swagger';
import { BookingRange } from '../enums';

export class SlotDto {
  @ApiProperty({
    example: '2026-07-07T09:00:00.000+07:00',
    description: 'Slot start (Asia/Ho_Chi_Minh, GMT+7)',
  })
  startAt!: string;

  @ApiProperty({
    example: '2026-07-07T11:00:00.000+07:00',
    description: 'Slot end (Asia/Ho_Chi_Minh, GMT+7)',
  })
  endAt!: string;

  @ApiProperty({ example: true })
  available!: boolean;
}

export class DaySlotsDto {
  @ApiProperty({
    example: '2026-07-07',
    description: 'Vietnam calendar date (YYYY-MM-DD)',
  })
  date!: string;

  @ApiProperty({ type: [SlotDto] })
  slots!: SlotDto[];
}

export class AvailableSlotsResponseDto {
  @ApiProperty({ example: 'uuid' })
  expertId!: string;

  @ApiProperty({ example: 2 })
  sessionLengthHours!: number;

  @ApiProperty({ enum: BookingRange, example: BookingRange.WEEK })
  range!: BookingRange;

  @ApiProperty({
    example: '2026-07-07',
    description: 'Range start date (Vietnam calendar, YYYY-MM-DD)',
  })
  from!: string;

  @ApiProperty({
    example: '2026-07-13',
    description: 'Range end date (Vietnam calendar, YYYY-MM-DD)',
  })
  to!: string;

  @ApiProperty({ type: [DaySlotsDto] })
  days!: DaySlotsDto[];
}
