import { ApiProperty } from '@nestjs/swagger';

export class UpdateStatusDto {
  @ApiProperty({ description: 'Enable or disable the user account' })
  isActive!: boolean;
}
