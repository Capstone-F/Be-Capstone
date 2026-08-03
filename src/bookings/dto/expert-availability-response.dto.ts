import { ApiProperty } from '@nestjs/swagger';

export class ExpertAvailabilityResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  expertId!: string;

  @ApiProperty({
    example: 1,
    description: '0 = Sunday .. 6 = Saturday (Vietnam local day-of-week)',
  })
  dayOfWeek!: number;

  @ApiProperty({
    example: 9,
    description: 'Inclusive start hour (GMT+7, 09–19)',
  })
  startHour!: number;

  @ApiProperty({
    example: 12,
    description: 'Exclusive end hour (GMT+7, 10–20)',
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
