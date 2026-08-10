import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class MarkSupportReadDto {
  @ApiProperty({
    description: 'Mark all messages up to and including this seq as read',
    example: 12,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastReadSeq!: number;
}
