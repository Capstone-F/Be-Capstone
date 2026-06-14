import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({ description: 'Enable or disable the user account' })
  @IsBoolean()
  isActive!: boolean;
}
