import { ApiProperty } from '@nestjs/swagger';

export class ExpertAvailabilityResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  expertId!: string;

  @ApiProperty({
    example: 1,
    description: '0 = Sunday .. 6 = Saturday (JS Date.getUTCDay())',
  })
  dayOfWeek!: number;

  @ApiProperty({
    example: 9,
    description: 'Inclusive start hour (UTC, 0-23)',
  })
  startHour!: number;

  @ApiProperty({
    example: 12,
    description: 'Exclusive end hour (UTC, 1-24)',
  })
  endHour!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ExpertAvailabilityListDto {
  @ApiProperty({ type: [ExpertAvailabilityResponseDto] })
  items!: ExpertAvailabilityResponseDto[];
}
