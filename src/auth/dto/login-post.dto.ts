import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body for POST /auth/login (SPA flow: receive login_uri, then window.location). */
export class LoginPostDto {
  @ApiProperty({
    description:
      'Absolute URL to open after successful login (must be same origin as FRONTEND_URL).',
    example: 'http://localhost:5173/dashboard',
  })
  client_redirect_uri!: string;

  @ApiPropertyOptional({
    description: 'Optional IdP hint (e.g. google).',
    example: 'google',
  })
  idpHint?: string;
}
