import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductCategoryResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'SERUM' })
  code!: string;

  @ApiProperty({ example: 'Serum' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Concentrated treatment serums',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
