import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportSessionStatus } from '../enums';

export class SupportSessionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  customerUserId!: string;

  @ApiPropertyOptional({ example: 'Jane Doe', nullable: true })
  customerName!: string | null;

  @ApiProperty({
    enum: SupportSessionStatus,
    example: SupportSessionStatus.OPEN,
  })
  status!: SupportSessionStatus;

  @ApiPropertyOptional({ example: 'Order delivery issue', nullable: true })
  subject!: string | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  assignedStaffUserId!: string | null;

  @ApiPropertyOptional({ example: 'Staff Name', nullable: true })
  assignedStaffName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  assignedAt!: Date | null;

  @ApiProperty({ example: 3 })
  messageCount!: number;

  @ApiProperty({ example: 2 })
  customerLastReadSeq!: number;

  @ApiProperty({ example: 1 })
  staffLastReadSeq!: number;

  @ApiPropertyOptional({ nullable: true })
  lastMessageAt!: Date | null;

  @ApiPropertyOptional({
    example: 'Hello, I need help with my order.',
    nullable: true,
  })
  lastMessagePreview!: string | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  closedByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  closedAt!: Date | null;

  @ApiPropertyOptional({ example: 'Issue resolved', nullable: true })
  closeReason!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedSupportSessionsDto {
  @ApiProperty({ type: [SupportSessionResponseDto] })
  items!: SupportSessionResponseDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
