import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../auth/roles.enum';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keycloakSub: string;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty()
  provider: string;

  @ApiProperty({ enum: Role, isArray: true })
  roles: Role[];

  @ApiPropertyOptional({ nullable: true })
  clinicId: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedUsersDto {
  @ApiProperty({ type: [UserResponseDto] })
  items: UserResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
