import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body for POST /auth/login (SPA flow: receive login_uri, then window.location). */
export class LoginPostDto {
  @ApiProperty({
    description:
      'Absolute URL to open after successful login (must be same origin as FRONTEND_URL).',
    example: 'http://localhost:5173/dashboard',
  })
  @IsString()
  @IsNotEmpty()
  client_redirect_uri!: string;

  @ApiPropertyOptional({
    description: 'Optional IdP hint (e.g. google).',
    example: 'google',
  })
  @IsOptional()
  @IsString()
  idpHint?: string;
}
