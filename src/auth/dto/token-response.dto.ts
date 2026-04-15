import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token: string;

  @ApiProperty({ description: 'Token lifetime in seconds', example: 300 })
  expires_in: number;

  @ApiPropertyOptional({ description: 'Refresh token lifetime in seconds', example: 1800 })
  refresh_expires_in?: number;

  @ApiPropertyOptional({ description: 'Refresh token for obtaining new access tokens' })
  refresh_token?: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  token_type: string;

  @ApiPropertyOptional({ description: 'OIDC ID token (JWT)' })
  id_token?: string;

  @ApiPropertyOptional({ description: 'Granted scopes', example: 'openid profile email' })
  scope?: string;
}

export class UserDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: '12345678-abcd-efgh-ijkl-123456789012' })
  keycloakSub: string;

  @ApiPropertyOptional({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: 'John Doe', nullable: true })
  name: string | null;

  @ApiProperty({ example: 'google' })
  provider: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-04-15T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-04-15T12:00:00.000Z' })
  updatedAt: Date;
}

export class AuthCallbackResponseDto {
  @ApiProperty({ type: TokenResponseDto })
  token: TokenResponseDto;

  @ApiProperty({
    description: 'Keycloak user profile from the userinfo endpoint',
    example: { sub: '12345', email: 'user@example.com', name: 'John Doe', preferred_username: 'john' },
  })
  profile: Record<string, unknown>;

  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ description: 'Whether this is the first time the user logged in', example: true })
  isNewUser: boolean;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}
