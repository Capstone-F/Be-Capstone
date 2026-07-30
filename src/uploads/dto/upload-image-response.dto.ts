import { ApiProperty } from '@nestjs/swagger';

export class UploadImageResponseDto {
  @ApiProperty({
    example: 'https://pub-xxxxxxxx.r2.dev/images/2026/07/uuid.jpg',
  })
  url!: string;

  @ApiProperty({ example: 'images/2026/07/uuid.jpg' })
  key!: string;
}
