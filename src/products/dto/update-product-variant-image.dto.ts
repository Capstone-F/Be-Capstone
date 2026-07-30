import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class UpdateProductVariantImageDto {
  @ApiProperty({
    example: 'https://placehold.co/400',
    description: 'Public image URL (e.g. from POST /uploads/images)',
  })
  @IsUrl({ require_tld: false })
  imageUrl!: string;
}
