import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileRefreshTokenDto {
  @ApiProperty({
    description: 'Keycloak refresh token obtained from /auth/mobile/exchange',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
