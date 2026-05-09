import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionUserDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-000000000000' })
  id: string;

  @ApiProperty({
    example: 'auth0|65f0d3f1c2b3a4e5d6f7a8b9',
    description:
      'Immutable Auth0 user ID (sub claim). Format depends on the connection: ' +
      '"auth0|..." for database users, "google-oauth2|..." for Google social, etc.',
  })
  auth0Sub: string;

  @ApiPropertyOptional({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: 'John Doe', nullable: true })
  name: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-04-17T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-04-17T00:00:00.000Z' })
  updatedAt: Date;
}
