import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpsertExpertConsultationFeeDto {
  @ApiProperty({
    example: 300000,
    minimum: 0,
    description: 'Consultation fee in VND',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultationFee!: number;
}
