import { ApiProperty } from '@nestjs/swagger';

export class RefreshRequestDto {
  @ApiProperty({
    description: 'Refresh token from a previous token response',
  })
  refreshToken: string;
}
