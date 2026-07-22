import { RecommendationService } from './recommendation.service';
import { SurveyRecommendation } from './survey-recommendation.entity';
import { ProductIngredient } from '../products/product-ingredient.entity';

describe('RecommendationService protocol coverage helpers', () => {
  const service = Object.create(
    RecommendationService.prototype,
  ) as RecommendationService;

  const recommendation = {
    items: [
      {
        id: 'item-1',
        productVariantId: 'a',
        rankedVariants: [{ productVariantId: 'a' }, { productVariantId: 'b' }],
      },
      {
        id: 'item-2',
        productVariantId: 'c',
        rankedVariants: [{ productVariantId: 'c' }],
      },
    ],
  } as SurveyRecommendation;

  it('allows any ranked variant id', () => {
    expect(service.getAllowedVariantIds(recommendation).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('treats combo as at least one variant per protocol', () => {
    expect(service.isProtocolCoverageComplete(recommendation, ['a', 'c'])).toBe(
      true,
    );
    expect(service.isProtocolCoverageComplete(recommendation, ['b', 'c'])).toBe(
      true,
    );
    expect(
      service.isProtocolCoverageComplete(recommendation, ['a', 'b', 'c']),
    ).toBe(true);
    expect(service.isProtocolCoverageComplete(recommendation, ['a'])).toBe(
      false,
    );
    expect(service.isProtocolCoverageComplete(recommendation, ['a', 'b'])).toBe(
      false,
    );
  });

  it('maps any ranked variant back to its recommendation item', () => {
    expect(service.findItemIdForVariant(recommendation, 'b')).toBe('item-1');
    expect(service.findItemIdForVariant(recommendation, 'c')).toBe('item-2');
    expect(service.findItemIdForVariant(recommendation, 'missing')).toBeNull();
  });
});

describe('RecommendationService allergy and conflict mapping', () => {
  const service = Object.create(
    RecommendationService.prototype,
  ) as RecommendationService & {
    hasAllergicIngredient: (
      productIngredients: ProductIngredient[],
      allergyCodes: Set<string>,
    ) => boolean;
    toDto: (
      recommendation: SurveyRecommendation,
      context: {
        customerProfile: null;
        labels: [];
        protocols: Array<{ id: string; code: string; name: string }>;
      },
      conflicts: Array<{
        protocol?: { code: string };
        conflictingProtocol?: { code: string };
        severity: string;
        reason: string | null;
      }>,
    ) => {
      conflicts?: Array<{
        protocolCode: string;
        conflictingProtocolCode: string;
        severity: string;
        reason: string | null;
      }>;
    };
  };

  it('detects fragrance allergy from ingredient name', () => {
    const ingredients = [
      {
        ingredient: { name: 'Fragrance / Parfum' },
      },
    ] as ProductIngredient[];

    expect(
      service.hasAllergicIngredient(ingredients, new Set(['FRAGRANCE'])),
    ).toBe(true);
    expect(
      service.hasAllergicIngredient(ingredients, new Set(['NIACINAMIDE'])),
    ).toBe(false);
  });

  it('maps ingredient conflicts onto recommendation DTO', () => {
    const dto = service.toDto(
      {
        id: 'rec-1',
        customerSurveyId: 'survey-1',
        createdAt: new Date('2026-01-01'),
        items: [],
      } as unknown as SurveyRecommendation,
      {
        customerProfile: null,
        labels: [],
        protocols: [{ id: 'p1', code: 'A', name: 'A' }],
      },
      [
        {
          protocol: { code: 'A' },
          conflictingProtocol: { code: 'B' },
          severity: 'HIGH',
          reason: 'Do not combine',
        },
      ],
    );

    expect(dto.conflicts).toEqual([
      {
        protocolCode: 'A',
        conflictingProtocolCode: 'B',
        severity: 'HIGH',
        reason: 'Do not combine',
      },
    ]);
  });
});
