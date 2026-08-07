import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Gender } from '../../users/gender.enum';

export class StartSurveyDto {
  @ApiPropertyOptional({
    example: '1995-06-15',
    description: 'Optional for guests; used by the rule engine age labels',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Optional phone number for guests to pre-fill profile',
    example: '0987654321',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['FRAGRANCE', 'RETINOIDS'],
    description:
      'Optional allergy label codes (ALLERGY category). Applied when starting as guest.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergyCodes?: string[];
}

export class ClaimGuestSurveyDto {
  @ApiProperty({
    description: 'Guest token returned from POST /surveys when unauthenticated',
    example: 'a1b2c3d4...',
  })
  @IsString()
  @IsNotEmpty()
  guestToken!: string;
}
