import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import {
  BAUMANN_SKIN_TYPE_CODES,
  type BaumannSkinTypeCode,
} from '../../users/skin-type.enums';

export class UpdateCustomerSkinTypeDto {
  @ApiProperty({
    example: 'OSPT',
    enum: BAUMANN_SKIN_TYPE_CODES,
    description:
      'Baumann 16-type code (O/D × S/R × P/N × W/T). Updates the customer profile skin type.',
  })
  @IsString()
  @IsIn([...BAUMANN_SKIN_TYPE_CODES], {
    message: `skinTypeCode must be one of: ${BAUMANN_SKIN_TYPE_CODES.join(', ')}`,
  })
  skinTypeCode: BaumannSkinTypeCode;

  @ApiPropertyOptional({
    example: 72,
    nullable: true,
    description:
      'Oily–Dry axis score (positive = oilier). Omitted or null clears the score.',
  })
  @IsOptional()
  @IsInt()
  oilyDryScore?: number | null;

  @ApiPropertyOptional({
    example: 65,
    nullable: true,
    description:
      'Sensitive–Resistant axis score (higher = more sensitive). Omitted or null clears the score.',
  })
  @IsOptional()
  @IsInt()
  sensitiveResistantScore?: number | null;

  @ApiPropertyOptional({
    example: 58,
    nullable: true,
    description:
      'Pigmented–Non-pigmented axis score (higher = more pigmented). Omitted or null clears the score.',
  })
  @IsOptional()
  @IsInt()
  pigmentedNonPigmentedScore?: number | null;

  @ApiPropertyOptional({
    example: 30,
    nullable: true,
    description:
      'Wrinkled–Tight axis score (higher = more wrinkled). Omitted or null clears the score.',
  })
  @IsOptional()
  @IsInt()
  wrinkledTightScore?: number | null;
}
