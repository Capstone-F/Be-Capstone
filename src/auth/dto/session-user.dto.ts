import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionUserDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-000000000000' })
  id: string;

  @ApiProperty({ example: 'kc-sub-uuid' })
  keycloakSub: string;

  @ApiPropertyOptional({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: 'John Doe', nullable: true })
  name: string | null;

  @ApiProperty({ example: 'google' })
  provider: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-04-17T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-04-17T00:00:00.000Z' })
  updatedAt: Date;
}
