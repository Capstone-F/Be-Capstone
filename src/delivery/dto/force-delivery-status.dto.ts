import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GHN_STATUS_MAP } from '../ghn.status-map';

const FORCEABLE_STATUSES = Object.keys(GHN_STATUS_MAP);

export class ForceDeliveryStatusDto {
  @ApiProperty({
    description:
      'Any key of GHN_STATUS_MAP (e.g. delivering, returned, delivery_fail).',
    example: 'returned',
    enum: FORCEABLE_STATUSES,
  })
  @IsString()
  @IsIn(FORCEABLE_STATUSES)
  providerStatus!: string;

  @ApiPropertyOptional({
    description: 'Optional note stored in the audit rawPayload.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
