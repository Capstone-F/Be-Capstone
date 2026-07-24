/**
 * Static coverage check: five survey personas must map to ≥1 protocol with a
 * linked product SKU (seed catalog). Stock is asserted separately via seed
 * creating SEED-<SKU> batches.
 */
import { LabelMatchType } from '../../ingredients/enums';

type Mapping = {
  protocolCode: string;
  labelCode: string;
  matchType: LabelMatchType;
};

// Keep in sync with PROTOCOL_LABEL_MAPPINGS / PRODUCT_PROTOCOL_MAPPINGS in seed.ts
// (duplicated lightly so this test does not import the side-effecting seed module).
const PROTOCOL_LABEL_MAPPINGS: Mapping[] = [
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'ANTI_AGING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'REDUCE_WRINKLES',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'PREGNANCY',
    matchType: LabelMatchType.EXCLUDED,
  },
  {
    protocolCode: 'salicylic_acne',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDUCE_PIGMENTATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'BARRIER_DAMAGE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'ROSACEA',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ha_hydration',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'ANTI_AGING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'BRIGHTENING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'EVEN_SKIN_TONE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'glycolic_exfoliation',
    labelCode: 'IMPROVE_SKIN_TEXTURE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'benzoyl_acne',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'OIL_CONTROL',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'toner_exfoliating',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'toner_exfoliating',
    labelCode: 'IMPROVE_SKIN_TEXTURE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'toner_exfoliating',
    labelCode: 'MINIMIZE_PORES',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'serum_niacinamide',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'serum_niacinamide',
    labelCode: 'EVEN_SKIN_TONE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'serum_niacinamide',
    labelCode: 'BRIGHTENING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'ROSACEA',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'HIGH_SUN_EXPOSURE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'REDUCE_PIGMENTATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'treatment_acne_spot',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
];

const PRODUCT_PROTOCOL_MAPPINGS: Array<{ sku: string; protocolCode: string }> =
  [
    { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'cleanser_gentle_foam' },
    { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'ceramide_barrier' },
    { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'niacinamide_general' },
    { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'toner_exfoliating' },
    {
      sku: 'SOMEBYMI-MIRACLE-TONER-150ML',
      protocolCode: 'glycolic_exfoliation',
    },
    { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'salicylic_acne' },
    { sku: 'TO-NIACINAMIDE-10-ZINC-30ML', protocolCode: 'serum_niacinamide' },
    { sku: 'TO-NIACINAMIDE-10-ZINC-30ML', protocolCode: 'niacinamide_general' },
    { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'moisturizer_barrier' },
    { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ceramide_barrier' },
    { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ha_hydration' },
    { sku: 'LRP-ANTHELIOS-UVMUNE-50ML', protocolCode: 'sunscreen_daily_spf' },
    { sku: 'LRP-ANTHELIOS-UVMUNE-50ML', protocolCode: 'ha_hydration' },
    { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'treatment_acne_spot' },
    { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'benzoyl_acne' },
    { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'azelaic_pigmentation' },
    { sku: 'TO-RETINOL-0.3-30ML', protocolCode: 'retinol_0.3_anti_aging' },
    {
      sku: 'LRP-TOLERIANE-SENSITIVE-40ML',
      protocolCode: 'moisturizer_barrier',
    },
    { sku: 'LRP-TOLERIANE-SENSITIVE-40ML', protocolCode: 'ceramide_barrier' },
    {
      sku: 'LRP-TOLERIANE-SENSITIVE-40ML',
      protocolCode: 'niacinamide_general',
    },
  ];

const CASES: Array<{ name: string; labels: string[] }> = [
  {
    name: 'Acne / oily',
    labels: [
      'ACNE',
      'ACNE_TREATMENT',
      'OIL_CONTROL',
      'HEAVY_MAKEUP',
      'BLACKHEADS',
      'ENLARGED_PORES',
      'INTERMEDIATE',
      'FEMALE',
      'AGE_18_25',
    ],
  },
  {
    name: 'Pigment + sun',
    labels: [
      'HYPERPIGMENTATION',
      'REDUCE_PIGMENTATION',
      'EVEN_SKIN_TONE',
      'HIGH_SUN_EXPOSURE',
      'MELASMA',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'BEGINNER',
      'FEMALE',
      'AGE_26_35',
    ],
  },
  {
    name: 'Dehydrated / barrier',
    labels: [
      'DEHYDRATED_SKIN',
      'HYDRATION',
      'BARRIER_REPAIR',
      'AIR_CONDITIONED_ENVIRONMENT',
      'BARRIER_DAMAGE',
      'MALE',
      'AGE_18_25',
    ],
  },
  {
    name: 'Anti-aging',
    labels: [
      'WRINKLES',
      'ANTI_AGING',
      'REDUCE_WRINKLES',
      'HIGH_STRESS',
      'ADVANCED',
      'FEMALE',
      'AGE_36_45',
    ],
  },
  {
    name: 'Redness / rosacea-prone',
    labels: [
      'REDNESS',
      'REDUCE_REDNESS',
      'HIGH_STRESS',
      'ROSACEA',
      'FEMALE',
      'AGE_26_35',
    ],
  },
];

function matchProtocols(labelCodes: string[]): string[] {
  const labels = new Set(labelCodes);
  const byProtocol = new Map<string, Mapping[]>();
  for (const m of PROTOCOL_LABEL_MAPPINGS) {
    const list = byProtocol.get(m.protocolCode) ?? [];
    list.push(m);
    byProtocol.set(m.protocolCode, list);
  }

  const matched: string[] = [];
  for (const [code, mappings] of byProtocol) {
    if (
      mappings.some(
        (m) =>
          m.matchType === LabelMatchType.EXCLUDED && labels.has(m.labelCode),
      )
    ) {
      continue;
    }
    const required = mappings.filter(
      (m) => m.matchType === LabelMatchType.REQUIRED,
    );
    if (required.some((m) => !labels.has(m.labelCode))) continue;
    const optionalHits = mappings.filter(
      (m) => m.matchType === LabelMatchType.OPTIONAL && labels.has(m.labelCode),
    ).length;
    const score = required.length + optionalHits;
    if (score >= 1) matched.push(code);
  }
  return matched;
}

describe('seed survey case coverage', () => {
  for (const c of CASES) {
    it(`${c.name}: matches protocols with linked products`, () => {
      const protocols = matchProtocols(c.labels);
      expect(protocols.length).toBeGreaterThan(0);

      const skus = new Set(
        protocols.flatMap((protocolCode) =>
          PRODUCT_PROTOCOL_MAPPINGS.filter(
            (m) => m.protocolCode === protocolCode,
          ).map((m) => m.sku),
        ),
      );
      expect(skus.size).toBeGreaterThan(0);
    });
  }

  it('anti-aging case includes retinol product SKU', () => {
    const protocols = matchProtocols(
      CASES.find((c) => c.name === 'Anti-aging')!.labels,
    );
    expect(protocols).toContain('retinol_0.3_anti_aging');
    expect(
      PRODUCT_PROTOCOL_MAPPINGS.some(
        (m) =>
          m.protocolCode === 'retinol_0.3_anti_aging' &&
          m.sku === 'TO-RETINOL-0.3-30ML',
      ),
    ).toBe(true);
  });
});
