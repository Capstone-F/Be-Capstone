import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
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
}
