import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../auth/roles.enum';

export class AssignRolesDto {
  @ApiProperty({
    enum: Role,
    isArray: true,
    example: [Role.Staff],
    description: 'Replaces all application roles for the user',
  })
  roles!: Role[];
}
