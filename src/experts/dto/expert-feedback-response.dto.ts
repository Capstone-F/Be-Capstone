import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExpertFeedbackItemDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  consultationId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiPropertyOptional({ example: 'Great consultation', nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ example: 'Jane Doe', nullable: true })
  customerName!: string | null;

  @ApiProperty({ example: '2026-07-07T09:00:00.000Z' })
  createdAt!: Date;
}

export class PaginatedExpertFeedbacksDto {
  @ApiProperty({ type: [ExpertFeedbackItemDto] })
  items!: ExpertFeedbackItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({
    example: 4.5,
    description: 'Average rating across all feedback for this expert',
  })
  averageRating!: number;

  @ApiProperty({
    example: 12,
    description: 'Total number of ratings for this expert',
  })
  ratingCount!: number;
}
