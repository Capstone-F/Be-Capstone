import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum } from 'class-validator';
import { Role } from '../../auth/roles.enum';

export class AssignRolesDto {
  @ApiProperty({
    enum: Role,
    isArray: true,
    example: [Role.Staff],
    description: 'Replaces all application roles for the user',
  })
  @IsArray()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
