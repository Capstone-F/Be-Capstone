import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class UpdateOwnExpertAvatarDto {
  @ApiProperty({
    example: 'https://placehold.co/400',
    description: 'Expert avatar URL (e.g. from POST /uploads/images)',
  })
  @IsUrl({ require_tld: false })
  avatarUrl!: string;
}
