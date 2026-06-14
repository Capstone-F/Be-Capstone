import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../auth/roles.enum';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Search by email or name' })
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  role?: Role;

  @ApiPropertyOptional({ description: 'Filter by partner clinic id' })
  clinicId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  limit?: number;
}
