import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../auth/roles.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'expert@clinic.example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Expert' })
  name!: string;

  @ApiProperty({
    enum: [Role.Staff, Role.Expert, Role.ClinicManager],
    example: Role.Expert,
  })
  role!: Role;

  @ApiPropertyOptional({
    description: 'Required for expert and clinic_manager roles',
    example: 'clinic-uuid',
  })
  clinicId?: string;

  @ApiProperty({
    description: 'Temporary password; user must change on first login',
    example: 'TempPass123!',
  })
  temporaryPassword!: string;
}
