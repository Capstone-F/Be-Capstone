import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileLoginDto {
  @ApiProperty({
    description: 'Keycloak username or email address',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({
    description: 'Account password',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
