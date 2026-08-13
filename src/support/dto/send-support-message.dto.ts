import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, IsOptional, IsObject } from 'class-validator';

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

  @ApiProperty({
    description: 'Optional metadata attached to the message (e.g. products)',
    example: { type: 'product', productId: 'uuid' },
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any> | null;
}
