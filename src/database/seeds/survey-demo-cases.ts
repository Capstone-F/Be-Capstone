/**
 * Canonical seeded demo personas for survey → rule engine → products.
 * Keep in sync with docs/survey-flow.md §10.5 and survey-cases.coverage.spec.ts.
 *
 * Labels include CORE + L2 (+ age/personality signals) that a real expanded
 * bank would emit. Rule-engine matching still keys off concern/goal/lifestyle
 * codes wired in PROTOCOL_LABEL_MAPPINGS.
 */
export type SurveyDemoCase = {
  name: string;
  /** Short docs persona title */
  persona: string;
  /** Base profile notes for docs */
  baseProfile: string;
  /** DOB used when deriving AGE_* profile labels (year approximates docs). */
  dateOfBirth: string;
  gender: 'FEMALE' | 'MALE';
  /** Full label set: survey answers ∪ profile age/gender */
  labels: string[];
  /** Protocol codes that must match (subset of seed PROTOCOL_LABEL_MAPPINGS) */
  expectedProtocolCodes: string[];
  /** At least these SKUs must be reachable via matched protocols */
  expectedSkus: string[];
};

export const SURVEY_DEMO_CASES: SurveyDemoCase[] = [
  {
    name: 'Acne / oily',
    persona: 'Acne / oily',
    baseProfile: 'DOB ~2001, `FEMALE`, no allergies',
    dateOfBirth: '2001-05-12',
    gender: 'FEMALE',
    labels: [
      // CORE concern / goals / lifestyle
      'ACNE',
      'ACNE_TREATMENT',
      'OIL_CONTROL',
      'HEAVY_MAKEUP',
      'HOT_HUMID',
      // Baumann / skin-type signals
      'OILY_TENDENCY',
      'COMBINATION_TENDENCY',
      // L2 acne module
      'BLACKHEADS',
      'ENLARGED_PORES',
      'INTERMEDIATE',
      // Personality
      'PERSONALITY_QUICK_RESULT',
      // Profile
      'FEMALE',
      'AGE_18_25',
    ],
    expectedProtocolCodes: [
      'salicylic_acne',
      'benzoyl_acne',
      'treatment_acne_spot',
      'niacinamide_general',
      'toner_exfoliating',
      'cleanser_gentle_foam',
    ],
    expectedSkus: [
      'LRP-EFFAC-DUO-40ML',
      'SOMEBYMI-MIRACLE-TONER-150ML',
      'TO-NIACINAMIDE-10-ZINC-30ML',
      'CERAVE-FOAM-CLEANSER-236ML',
    ],
  },
  {
    name: 'Pigment + sun',
    persona: 'Pigment + sun',
    baseProfile: 'DOB ~1993, `FEMALE`',
    dateOfBirth: '1993-08-20',
    gender: 'FEMALE',
    labels: [
      'HYPERPIGMENTATION',
      'REDUCE_PIGMENTATION',
      'EVEN_SKIN_TONE',
      'HIGH_SUN_EXPOSURE',
      'MELASMA',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'PIGMENTED_TENDENCY',
      'BEGINNER',
      'SUNSCREEN_DAILY',
      'PERSONALITY_SAFETY_FIRST',
      'FEMALE',
      'AGE_26_35',
    ],
    expectedProtocolCodes: [
      'azelaic_pigmentation',
      'niacinamide_general',
      'serum_niacinamide',
      'sunscreen_daily_spf',
    ],
    expectedSkus: [
      'LRP-EFFAC-DUO-40ML',
      'TO-NIACINAMIDE-10-ZINC-30ML',
      'LRP-ANTHELIOS-UVMUNE-50ML',
    ],
  },
  {
    name: 'Dehydrated / barrier',
    persona: 'Dehydrated / barrier',
    baseProfile: 'DOB ~1998, `MALE`',
    dateOfBirth: '1998-03-03',
    gender: 'MALE',
    labels: [
      'DEHYDRATED_SKIN',
      'HYDRATION',
      'BARRIER_REPAIR',
      'AIR_CONDITIONED_ENVIRONMENT',
      'BARRIER_DAMAGE',
      'DRY_TENDENCY',
      'SENSITIVE_TENDENCY',
      'PERSONALITY_SENSITIVE_CARE',
      'MALE',
      'AGE_26_35',
    ],
    expectedProtocolCodes: [
      'ha_hydration',
      'ceramide_barrier',
      'moisturizer_barrier',
      'cleanser_gentle_foam',
      'sunscreen_daily_spf',
    ],
    expectedSkus: [
      'CERAVE-MOIST-CREAM-454G',
      'CERAVE-FOAM-CLEANSER-236ML',
      'LRP-ANTHELIOS-UVMUNE-50ML',
    ],
  },
  {
    name: 'Anti-aging',
    persona: 'Anti-aging',
    baseProfile: 'DOB ~1984, `FEMALE`',
    dateOfBirth: '1984-11-02',
    gender: 'FEMALE',
    labels: [
      'WRINKLES',
      'ANTI_AGING',
      'REDUCE_WRINKLES',
      'HIGH_STRESS',
      'WRINKLED_TENDENCY',
      'FINE_LINES',
      'ADVANCED',
      'USING_RETINOID',
      'PERSONALITY_TREATMENT_FOCUSED',
      'FEMALE',
      'AGE_36_45',
    ],
    expectedProtocolCodes: ['retinol_0.3_anti_aging', 'niacinamide_general'],
    expectedSkus: [
      'TO-RETINOL-0.3-30ML',
      'TO-NIACINAMIDE-10-ZINC-30ML',
      'CERAVE-FOAM-CLEANSER-236ML',
    ],
  },
  {
    name: 'Redness / sensitive',
    persona: 'Redness / sensitive',
    baseProfile: 'DOB ~1996, `FEMALE`',
    dateOfBirth: '1996-07-18',
    gender: 'FEMALE',
    labels: [
      // Symptom-based (no self-diagnosis ROSACEA ask); protocols still match via REDNESS / REDUCE_REDNESS / barrier
      'REDNESS',
      'REDUCE_REDNESS',
      'HIGH_STRESS',
      'BARRIER_DAMAGE',
      'SENSITIVE_TENDENCY',
      'PERSONALITY_SENSITIVE_CARE',
      'FRAGRANCE_FREE',
      'FEMALE',
      'AGE_26_35',
    ],
    expectedProtocolCodes: [
      'ceramide_barrier',
      'moisturizer_barrier',
      'azelaic_pigmentation',
    ],
    expectedSkus: [
      'LRP-TOLERIANE-SENSITIVE-40ML',
      'CERAVE-MOIST-CREAM-454G',
      'CERAVE-FOAM-CLEANSER-236ML',
      'LRP-EFFAC-DUO-40ML',
    ],
  },
];
