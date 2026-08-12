import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOrderCancellationDto {
  @ApiProperty({ description: 'Order to cancel' })
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({
    description: 'Optional reason shown on the cancellation record',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
