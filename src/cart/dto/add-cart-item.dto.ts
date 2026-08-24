import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { OrderSource } from '../../commerce/enums';

export class AddCartItemDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    enum: OrderSource,
    description:
      'Required when the cart is empty. SURVEY carts must include surveyRecommendationId; TREATMENT carts must include treatmentPhaseId.',
  })
  @IsEnum(OrderSource)
  source!: OrderSource;

  @ApiPropertyOptional({
    description:
      'Required when source is SURVEY. Cart may include recommended and other catalog variants.',
  })
  @IsOptional()
  @IsUUID()
  surveyRecommendationId?: string;

  @ApiPropertyOptional({
    description:
      'Required when source is TREATMENT. The paid treatment phase whose products are being purchased; other catalog variants may be added to the same cart.',
  })
  @IsOptional()
  @IsUUID()
  treatmentPhaseId?: string;
}
