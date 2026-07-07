import { ApiProperty } from '@nestjs/swagger';
import { BookingRange } from '../enums';

export class SlotDto {
  @ApiProperty({ example: '2026-07-07T09:00:00.000Z' })
  startAt!: Date;

  @ApiProperty({ example: '2026-07-07T11:00:00.000Z' })
  endAt!: Date;

  @ApiProperty({ example: true })
  available!: boolean;
}

export class DaySlotsDto {
  @ApiProperty({ example: '2026-07-07' })
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

  @ApiProperty({ example: '2026-07-07' })
  from!: string;

  @ApiProperty({ example: '2026-07-13' })
  to!: string;

  @ApiProperty({ type: [DaySlotsDto] })
  days!: DaySlotsDto[];
}
