import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';
import { Gender } from '../../users/gender.enum';

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^[\d+\-\s().]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '1995-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    type: [String],
    example: ['FRAGRANCE', 'RETINOIDS'],
    description:
      'Replaces the full allergy set. Each code must be an active ALLERGY label. Empty array clears allergies.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergyLabelCodes?: string[];
}
