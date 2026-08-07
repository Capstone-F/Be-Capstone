import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Optional guest token to claim survey data upon login',
  })
  @IsOptional()
  @IsString()
  guestToken?: string;
}
