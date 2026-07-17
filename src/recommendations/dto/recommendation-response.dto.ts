import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RuleEngineCustomerProfileDto,
  RuleEngineLabelDto,
  RuleEngineProtocolDto,
} from '../../rule-engine/dto/rule-engine-context.dto';
import { IsUUID } from 'class-validator';

export class RankedVariantDto {
  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  priceVnd!: number;

  @ApiPropertyOptional({ nullable: true })
  volume!: string | null;

  @ApiProperty()
  rank!: number;
}

export class RecommendedProductDto {
  @ApiProperty()
  recommendationItemId!: string;

  @ApiProperty()
  protocolId!: string;

  @ApiProperty()
  protocolCode!: string;

  @ApiProperty()
  protocolName!: string;

  @ApiProperty()
  matchScore!: number;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  productVariantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  priceVnd!: number;

  @ApiPropertyOptional({ nullable: true })
  volume!: string | null;

  @ApiProperty({ type: [RankedVariantDto] })
  variants!: RankedVariantDto[];
}

export class SelectRecommendationVariantDto {
  @ApiProperty()
  @IsUUID()
  productVariantId!: string;
}

export class RecommendationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerSurveyId!: string;

  @ApiPropertyOptional({ type: RuleEngineCustomerProfileDto, nullable: true })
  customerProfile!: RuleEngineCustomerProfileDto | null;

  @ApiProperty({ type: [RuleEngineLabelDto] })
  labels!: RuleEngineLabelDto[];

  @ApiProperty({ type: [RuleEngineProtocolDto] })
  protocols!: RuleEngineProtocolDto[];

  @ApiProperty({ type: [RecommendedProductDto] })
  products!: RecommendedProductDto[];

  @ApiProperty()
  createdAt!: Date;
}
