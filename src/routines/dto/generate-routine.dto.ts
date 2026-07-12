import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateRoutineDto {
  @ApiProperty({
    description: 'Paid SURVEY order id that unlocks routine generation',
  })
  @IsUUID()
  orderId!: string;
}
