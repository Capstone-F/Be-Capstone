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
import { ProductIngredient } from '../products/product-ingredient.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
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
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
    @InjectRepository(IngredientConflict)
    private readonly ingredientConflictRepository: Repository<IngredientConflict>,
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

    const protocolIdsList = context.protocols.map((p) => p.id);
    const conflicts =
      protocolIdsList.length === 0
        ? []
        : await this.ingredientConflictRepository.find({
            where: {
              protocolId: In(protocolIdsList),
              conflictingProtocolId: In(protocolIdsList),
            },
            relations: ['protocol', 'conflictingProtocol'],
          });

    return this.toDto(recommendation, context, conflicts);
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

    const [allergies] = await Promise.all([
      this.customerAllergyRepository.find({
        where: { customerId },
        relations: ['label'],
      }),
    ]);
    const allergyCodes = new Set(
      allergies
        .filter((allergy) => allergy.label?.isActive)
        .map((allergy) => allergy.label.code),
    );

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
            relations: [
              'product',
              'batches',
              'product.productIngredients',
              'product.productIngredients.ingredient',
            ],
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
    }> = [];

    for (const protocol of context.protocols) {
      const linkedProductIds = productsByProtocol.get(protocol.id) ?? [];
      let bestVariant: ProductVariant | null = null;
      for (const productId of linkedProductIds) {
        const productVariants = variantsByProductId.get(productId) ?? [];
        for (const variant of productVariants) {
          // BR-32: Check stock
          const remainingStock = (variant.batches ?? []).reduce(
            (sum, batch) => sum + batch.remainingQuantity,
            0,
          );
          if (remainingStock <= 0) continue;

          // BR-07: Check allergies
          const productIngredients = variant.product?.productIngredients ?? [];
          if (this.hasAllergicIngredient(productIngredients, allergyCodes)) {
            continue; // Skip allergic variants
          }

          if (
            !bestVariant ||
            variant.priceVnd < bestVariant.priceVnd ||
            (variant.priceVnd === bestVariant.priceVnd &&
              variant.sku < bestVariant.sku)
          ) {
            bestVariant = variant;
            // TODO: Tech Debt - BR-X: Apply ranking by ingredient concentration and budget preference here instead of just price
          }
        }
      }
      if (!bestVariant) continue;
      items.push({
        protocolId: protocol.id,
        productVariantId: bestVariant.id,
        matchScore: protocol.matchScore,
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

  private hasAllergicIngredient(
    mappings: ProductIngredient[],
    allergyCodes: Set<string>,
  ): boolean {
    if (allergyCodes.size === 0) {
      return false;
    }
    const ALLERGY_INGREDIENT_ALIASES: Record<string, string[]> = {
      FRAGRANCE: [
        'parfum',
        'fragrance',
        'linalool',
        'limonene',
        'citronellol',
        'geraniol',
        'benzyl salicylate',
        'essential oil',
      ],
      ALCOHOL: ['alcohol denat', 'ethanol', 'sd alcohol', 'isopropyl alcohol'],
      SULFATE: [
        'sls',
        'sles',
        'sodium lauryl sulfate',
        'sodium laureth sulfate',
        'ammonium lauryl sulfate',
      ],
      PARABEN: [
        'methylparaben',
        'propylparaben',
        'butylparaben',
        'ethylparaben',
      ],
      SILICONE: [
        'dimethicone',
        'cyclopentasiloxane',
        'cyclohexasiloxane',
        'amodimethicone',
        'phenyl trimethicone',
      ],
      MINERAL_OIL: ['mineral oil', 'paraffinum liquidum', 'petrolatum'],
      NUT_ALLERGY: [
        'almond oil',
        'macadamia oil',
        'shea butter',
        'argan oil',
        'peanut oil',
        'walnut extract',
      ],
      BEE_VENOM: ['bee venom', 'melittin', 'apis mellifera extract'],
    };

    return mappings.some((mapping) => {
      const ingredientCode = this.normalizeIngredientName(
        mapping.ingredient?.name ?? '',
      );
      return [...allergyCodes].some((allergyCode) => {
        const aliases = ALLERGY_INGREDIENT_ALIASES[allergyCode] ?? [
          allergyCode,
        ];
        return aliases.some(
          (alias) => ingredientCode === alias || ingredientCode.includes(alias),
        );
      });
    });
  }

  private normalizeIngredientName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '');
  }

  private toDto(
    recommendation: SurveyRecommendation,
    context: Awaited<ReturnType<RuleEngineService['buildContextForCustomer']>>,
    conflicts: IngredientConflict[] = [],
  ): RecommendationResponseDto {
    const protocolById = new Map(context.protocols.map((p) => [p.id, p]));
    return {
      id: recommendation.id,
      customerSurveyId: recommendation.customerSurveyId,
      customerProfile: context.customerProfile,
      labels: context.labels,
      protocols: context.protocols,
      conflicts: conflicts.map((c) => ({
        protocolCode: c.protocol?.code ?? '',
        conflictingProtocolCode: c.conflictingProtocol?.code ?? '',
        severity: c.severity,
        reason: c.reason,
      })),
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
