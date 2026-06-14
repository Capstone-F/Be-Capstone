import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Role } from '../../auth/roles.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'expert@clinic.example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Expert' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    enum: [Role.Staff, Role.Expert, Role.ClinicManager],
    example: Role.Expert,
  })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({
    description: 'Required for expert and clinic_manager roles',
    example: 'clinic-uuid',
  })
  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @ApiProperty({
    description: 'Temporary password; user must change on first login',
    example: 'TempPass123!',
  })
  @IsString()
  @IsNotEmpty()
  temporaryPassword!: string;
}
