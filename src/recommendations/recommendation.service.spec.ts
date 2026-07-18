import { RecommendationService } from './recommendation.service';
import { SurveyRecommendation } from './survey-recommendation.entity';

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
