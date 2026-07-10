import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body for POST /auth/login (SPA or mobile: receive login_uri). */
export class LoginPostDto {
  @ApiProperty({
    description:
      'Post-login redirect. Web: absolute http(s) URL with same origin as FRONTEND_URL. ' +
      'Mobile: exact match against MOBILE_REDIRECT_URIS (e.g. glowscan://auth/callback).',
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
