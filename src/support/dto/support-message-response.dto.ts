import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportMessageSenderRole } from '../enums';

export class SupportMessageResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  sessionId!: string;

  @ApiProperty({ example: 1 })
  seq!: number;

  @ApiProperty({ example: 'uuid' })
  senderUserId!: string;

  @ApiProperty({
    enum: SupportMessageSenderRole,
    example: SupportMessageSenderRole.CUSTOMER,
  })
  senderRole!: SupportMessageSenderRole;

  @ApiProperty({ example: 'Hello, I need help with my order.' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Metadata like attached products',
    example: { type: 'product', productId: 'uuid' },
    nullable: true,
  })
  metadata?: Record<string, any> | null;

  @ApiProperty()
  createdAt!: Date;
}

export class SupportMessagesPageDto {
  @ApiProperty({ type: [SupportMessageResponseDto] })
  items!: SupportMessageResponseDto[];

  @ApiProperty({
    description: 'Highest seq in this page (or afterSeq when empty)',
    example: 12,
  })
  lastSeq!: number;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}
