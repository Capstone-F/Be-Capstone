import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { SurveyRecommendation } from './survey-recommendation.entity';

export type RankedRecommendationVariant = {
  productVariantId: string;
  productId: string;
  productName: string;
  sku: string;
  priceVnd: number;
  volume: string | null;
  rank: number;
};

@Entity('survey_recommendation_items')
@Unique('UQ_survey_recommendation_items_rec_protocol', [
  'recommendationId',
  'protocolId',
])
export class SurveyRecommendationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recommendationId: string;

  @ManyToOne(() => SurveyRecommendation, (rec) => rec.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recommendationId' })
  recommendation: SurveyRecommendation;

  @Column()
  protocolId: string;

  @ManyToOne(() => IngredientProtocol, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ type: 'int', default: 0 })
  matchScore: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rankedVariants: RankedRecommendationVariant[];
}
