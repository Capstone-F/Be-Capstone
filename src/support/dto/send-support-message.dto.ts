import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendSupportMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'Hello, I need help with my order.',
    maxLength: 4000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
