import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Customer } from '../users/customer.entity';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';
import { SurveyRecommendationItem } from './survey-recommendation-item.entity';
import { SurveyRecommendation } from './survey-recommendation.entity';

@Injectable()
export class RecommendationService {
  constructor(
    private readonly ruleEngine: RuleEngineService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerSurvey)
    private readonly surveyRepository: Repository<CustomerSurvey>,
    @InjectRepository(SurveyRecommendation)
    private readonly recommendationRepository: Repository<SurveyRecommendation>,
    @InjectRepository(SurveyRecommendationItem)
    private readonly itemRepository: Repository<SurveyRecommendationItem>,
    @InjectRepository(ProductProtocol)
    private readonly productProtocolRepository: Repository<ProductProtocol>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
  ) {}

  async getLatestForUser(userId: string): Promise<RecommendationResponseDto> {
    const customer = await this.requireCustomer(userId);
    const survey = await this.surveyRepository.findOne({
      where: { customerId: customer.id, isCompleted: true },
      order: { completedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!survey) {
      throw new BadRequestException(
        'Complete a skincare survey before requesting recommendations',
      );
    }

    let recommendation = await this.recommendationRepository.findOne({
      where: { customerSurveyId: survey.id },
      relations: [
        'items',
        'items.protocol',
        'items.productVariant',
        'items.productVariant.product',
      ],
    });

    const context = await this.ruleEngine.buildContextForCustomer(customer.id);

    if (!recommendation) {
      recommendation = await this.createSnapshot(
        customer.id,
        survey.id,
        context,
      );
    }

    return this.toDto(recommendation, context);
  }

  async getByIdForCustomer(
    recommendationId: string,
    customerId: string,
  ): Promise<SurveyRecommendation> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: recommendationId, customerId },
      relations: ['items'],
    });
    if (!recommendation) {
      throw new NotFoundException(
        `Recommendation ${recommendationId} not found`,
      );
    }
    return recommendation;
  }

  /** Union of ranked variant ids (falls back to selected FK if ranked list empty). */
  getAllowedVariantIds(recommendation: SurveyRecommendation): string[] {
    const ids = new Set<string>();
    for (const item of recommendation.items ?? []) {
      for (const variantId of this.getItemVariantIds(item)) {
        ids.add(variantId);
      }
    }
    return [...ids];
  }

  /**
   * Combo eligibility: every protocol has at least one of its ranked variants
   * present in the cart (quantity ignored).
   */
  isProtocolCoverageComplete(
    recommendation: SurveyRecommendation,
    cartVariantIds: Iterable<string>,
  ): boolean {
    const cartSet = new Set(cartVariantIds);
    const items = recommendation.items ?? [];
    if (items.length === 0) return false;
    return items.every((item) =>
      this.getItemVariantIds(item).some((variantId) => cartSet.has(variantId)),
    );
  }

  findItemIdForVariant(
    recommendation: SurveyRecommendation,
    productVariantId: string,
  ): string | null {
    for (const item of recommendation.items ?? []) {
      if (this.getItemVariantIds(item).includes(productVariantId)) {
        return item.id;
      }
    }
    return null;
  }

  private getItemVariantIds(item: SurveyRecommendationItem): string[] {
    const ranked = (item.rankedVariants ?? []).map((v) => v.productVariantId);
    if (ranked.length > 0) return ranked;
    return item.productVariantId ? [item.productVariantId] : [];
  }

  private async createSnapshot(
    customerId: string,
    surveyId: string,
    context: Awaited<ReturnType<RuleEngineService['buildContextForCustomer']>>,
  ): Promise<SurveyRecommendation> {
    if (context.protocols.length === 0) {
      throw new BadRequestException(
        'No matching ingredient protocols for this survey profile',
      );
    }

    const protocolIds = context.protocols.map((p) => p.id);
    const productProtocols = await this.productProtocolRepository.find({
      where: { protocolId: In(protocolIds) },
      relations: ['product'],
    });

    const productIds = [
      ...new Set(
        productProtocols
          .filter((pp) => pp.product?.isActive)
          .map((pp) => pp.productId),
      ),
    ];
    const variants =
      productIds.length === 0
        ? []
        : await this.variantRepository.find({
            where: { productId: In(productIds), isActive: true },
            relations: ['product'],
            order: { priceVnd: 'ASC' },
          });

    const variantsByProductId = new Map<string, ProductVariant[]>();
    for (const variant of variants) {
      const list = variantsByProductId.get(variant.productId) ?? [];
      list.push(variant);
      variantsByProductId.set(variant.productId, list);
    }

    const productsByProtocol = new Map<string, string[]>();
    for (const pp of productProtocols) {
      if (!pp.product?.isActive) continue;
      const list = productsByProtocol.get(pp.protocolId) ?? [];
      list.push(pp.productId);
      productsByProtocol.set(pp.protocolId, list);
    }

    const items: Array<{
      protocolId: string;
      productVariantId: string;
      matchScore: number;
      rankedVariants: SurveyRecommendationItem['rankedVariants'];
    }> = [];

    for (const protocol of context.protocols) {
      const linkedProductIds = productsByProtocol.get(protocol.id) ?? [];
      const ranked = [
        ...new Map(
          linkedProductIds
            .flatMap((productId) => variantsByProductId.get(productId) ?? [])
            .map((variant) => [variant.id, variant]),
        ).values(),
      ]
        .sort((a, b) => a.priceVnd - b.priceVnd || a.sku.localeCompare(b.sku))
        .slice(0, 10);
      const bestVariant = ranked[0] ?? null;
      if (!bestVariant) continue;
      items.push({
        protocolId: protocol.id,
        productVariantId: bestVariant.id,
        matchScore: protocol.matchScore,
        rankedVariants: ranked.map((variant, index) => ({
          productVariantId: variant.id,
          productId: variant.productId,
          productName: variant.product?.name ?? '',
          sku: variant.sku,
          priceVnd: variant.priceVnd,
          volume: variant.volume,
          rank: index + 1,
        })),
      });
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'No catalog products mapped to matched protocols',
      );
    }

    // One primary variant per protocol
    const byProtocol = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const existing = byProtocol.get(item.protocolId);
      if (!existing) {
        byProtocol.set(item.protocolId, item);
      }
    }

    const recommendation = await this.recommendationRepository.save(
      this.recommendationRepository.create({
        customerId,
        customerSurveyId: surveyId,
      }),
    );

    await this.itemRepository.save(
      [...byProtocol.values()].map((item) =>
        this.itemRepository.create({
          recommendationId: recommendation.id,
          protocolId: item.protocolId,
          productVariantId: item.productVariantId,
          matchScore: item.matchScore,
          rankedVariants: item.rankedVariants,
        }),
      ),
    );

    const reloaded = await this.recommendationRepository.findOneOrFail({
      where: { id: recommendation.id },
      relations: [
        'items',
        'items.protocol',
        'items.productVariant',
        'items.productVariant.product',
      ],
    });
    return reloaded;
  }

  private toDto(
    recommendation: SurveyRecommendation,
    context: Awaited<ReturnType<RuleEngineService['buildContextForCustomer']>>,
  ): RecommendationResponseDto {
    const protocolById = new Map(context.protocols.map((p) => [p.id, p]));
    return {
      id: recommendation.id,
      customerSurveyId: recommendation.customerSurveyId,
      customerProfile: context.customerProfile,
      labels: context.labels,
      protocols: context.protocols,
      products: (recommendation.items ?? []).map((item) => {
        const protocol = protocolById.get(item.protocolId) ?? item.protocol;
        const variant = item.productVariant;
        return {
          recommendationItemId: item.id,
          protocolId: item.protocolId,
          protocolCode: protocol?.code ?? '',
          protocolName: protocol?.name ?? '',
          matchScore: item.matchScore,
          productId: variant.productId,
          productName: variant.product?.name ?? '',
          productVariantId: variant.id,
          sku: variant.sku,
          priceVnd: variant.priceVnd,
          volume: variant.volume,
          variants:
            (item.rankedVariants ?? []).length > 0
              ? item.rankedVariants
              : [
                  {
                    productVariantId: variant.id,
                    productId: variant.productId,
                    productName: variant.product?.name ?? '',
                    sku: variant.sku,
                    priceVnd: variant.priceVnd,
                    volume: variant.volume,
                    rank: 1,
                  },
                ],
        };
      }),
      createdAt: recommendation.createdAt,
    };
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }
    return customer;
  }
}
