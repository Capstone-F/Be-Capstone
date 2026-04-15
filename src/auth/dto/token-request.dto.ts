import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenRequestDto {
  @ApiProperty({
    description: 'Authorization code received from Keycloak callback',
    example: 'ac5f80b6-fb1a-4c88-b579-e81aacfd089e.5f621e71...',
  })
  code: string;

  @ApiPropertyOptional({
    description: 'Must match the redirect_uri used in the login request',
    example: 'http://localhost:3000/auth/callback',
  })
  redirectUri?: string;

  @ApiPropertyOptional({
    description: 'PKCE code verifier (if PKCE was used during login)',
  })
  codeVerifier?: string;

  @ApiPropertyOptional({
    description: 'Identity provider hint (e.g. "google") for user upsert',
    example: 'google',
  })
  idpHint?: string;
}
