import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginUrlDto {
  @ApiProperty({
    description: 'Full Keycloak authorization URL — redirect the user here',
    example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/auth?client_id=be-capstone-api&...',
  })
  authorizationUrl: string;

  @ApiProperty({
    description: 'Random state value for CSRF protection — store and verify on callback',
    example: '545c8242-ecee-4ac1-9433-313f6283b240',
  })
  state: string;

  @ApiProperty({
    description: 'The redirect URI that was used',
    example: 'http://localhost:3000/auth/callback',
  })
  redirectUri: string;

  @ApiPropertyOptional({
    description: 'IDP hint that was passed, or null',
    example: 'google',
    nullable: true,
  })
  idpHint: string | null;
}
