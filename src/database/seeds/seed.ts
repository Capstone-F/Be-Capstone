import { ConflictSeverity } from '../../products/enums/conflict-severity.enum';
import { AppDataSource } from '../data-source';
import { IngredientConflict } from '../../ingredients/ingredient-conflict.entity';
import { IngredientProtocol } from '../../ingredients/ingredient-protocol.entity';
import { Ingredient } from '../../ingredients/ingredient.entity';
import { ProtocolLabel } from '../../ingredients/protocol-label.entity';
import { LabelMatchType, TimeOfUse } from '../../ingredients/enums';
import { LabelCategory } from '../../survey/label-category.entity';
import { Label } from '../../survey/label.entity';
import { SkinType } from '../../users/skin-type.entity';
import {
  OilyDry,
  PigmentedNonPigmented,
  SensitiveResistant,
  WrinkledTight,
} from '../../users/skin-type.enums';
import { ProductCategory } from '../../products/product-category.entity';
import { ProductBrand } from '../../products/product-brand.entity';
import { Product } from '../../products/product.entity';
import { ProductVariant } from '../../products/product-variant.entity';
import { ProductIngredient } from '../../products/product-ingredient.entity';
import { ShelfLifeUnit } from '../../stock/enums';
import { DeliveryProvider } from '../../delivery/delivery-provider.entity';
import { SupportHabit } from '../../routines/support-habit.entity';
import { SupportHabitType } from '../../routines/enums';
import { Clinic } from '../../clinics/clinic.entity';
import { User } from '../../users/user.entity';
import { Expert } from '../../users/expert.entity';
import { ExpertAvailability } from '../../bookings/expert-availability.entity';
import { ExpertSpecialty } from '../../experts/expert-specialty.enum';
import { Role } from '../../auth/roles.enum';
import { Customer } from '../../users/customer.entity';
import { Order } from '../../commerce/order.entity';
import { OrderStatus } from '../../commerce/enums';

type LabelCategorySeed = { code: string; name: string; description: string };
type LabelSeed = {
  code: string;
  name: string;
  categoryCode: string;
  description: string;
  isActive?: boolean;
};

type IngredientSeed = {
  name: string;
  ingredientType: string;
  isActiveIngredient: boolean;
  description?: string;
};

type ProductCategorySeed = {
  code: string;
  name: string;
  description: string;
};

type ProductIngredientSeed = {
  ingredientName: string;
  concentrationPct?: number;
  isKeyIngredient?: boolean;
};

type ProductSeed = {
  name: string;
  brandName: string;
  categoryCode: string;
  description: string;
  sku: string;
  volume?: string;
  packaging?: string;
  priceVnd: number;
  shelfLifeValue?: number;
  shelfLifeUnit?: ShelfLifeUnit;
  ingredients: ProductIngredientSeed[];
};

const LABEL_CATEGORIES: LabelCategorySeed[] = [
  {
    code: 'SKIN_CONCERN',
    name: 'Skin Concern',
    description: 'Observed skin conditions and dermatologic concerns',
  },
  {
    code: 'SKIN_GOAL',
    name: 'Skin Goal',
    description: 'Desired treatment outcomes for skincare routines',
  },
  {
    code: 'ALLERGY',
    name: 'Allergy',
    description: 'Known cosmetic or skincare ingredient allergies',
  },
  {
    code: 'CONTRAINDICATION',
    name: 'Contraindication',
    description: 'Clinical or procedural factors that restrict treatment',
  },
  {
    code: 'AGE_GROUP',
    name: 'Age Group',
    description: 'Customer age range for protocol suitability',
  },
  {
    code: 'GENDER',
    name: 'Gender',
    description: 'Customer gender for protocol suitability',
  },
  {
    code: 'LIFESTYLE',
    name: 'Lifestyle',
    description: 'Environmental and behavioral lifestyle factors',
  },
  {
    code: 'EXPERIENCE_LEVEL',
    name: 'Experience Level',
    description: 'Customer familiarity with active skincare ingredients',
  },
  {
    code: 'PRODUCT_PREFERENCE',
    name: 'Product Preference',
    description: 'Formulation and product attribute preferences',
  },
];

const LABELS: LabelSeed[] = [
  // SKIN_CONCERN
  {
    code: 'ACNE',
    name: 'Acne',
    categoryCode: 'SKIN_CONCERN',
    description: 'Inflammatory and non-inflammatory acne lesions',
  },
  {
    code: 'BLACKHEADS',
    name: 'Blackheads',
    categoryCode: 'SKIN_CONCERN',
    description: 'Open comedones caused by oxidized sebum in pores',
  },
  {
    code: 'WHITEHEADS',
    name: 'Whiteheads',
    categoryCode: 'SKIN_CONCERN',
    description: 'Closed comedones with trapped sebum beneath the skin',
  },
  {
    code: 'ENLARGED_PORES',
    name: 'Enlarged Pores',
    categoryCode: 'SKIN_CONCERN',
    description: 'Visibly dilated follicular openings',
  },
  {
    code: 'HYPERPIGMENTATION',
    name: 'Hyperpigmentation',
    categoryCode: 'SKIN_CONCERN',
    description: 'Excess melanin deposition causing darkened skin patches',
  },
  {
    code: 'MELASMA',
    name: 'Melasma',
    categoryCode: 'SKIN_CONCERN',
    description: 'Symmetric hormonally influenced facial hyperpigmentation',
  },
  {
    code: 'FRECKLES',
    name: 'Freckles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Small ephelides from sun-induced melanin clusters',
  },
  {
    code: 'POST_INFLAMMATORY_HYPERPIGMENTATION',
    name: 'Post-inflammatory Hyperpigmentation',
    categoryCode: 'SKIN_CONCERN',
    description: 'Dark marks remaining after inflammatory skin injury (PIH)',
  },
  {
    code: 'POST_INFLAMMATORY_ERYTHEMA',
    name: 'Post-inflammatory Erythema',
    categoryCode: 'SKIN_CONCERN',
    description: 'Persistent redness after inflammatory skin injury (PIE)',
  },
  {
    code: 'WRINKLES',
    name: 'Wrinkles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Visible creases from collagen and elastin loss',
  },
  {
    code: 'FINE_LINES',
    name: 'Fine Lines',
    categoryCode: 'SKIN_CONCERN',
    description: 'Early superficial lines from dehydration or photoaging',
  },
  {
    code: 'DULL_SKIN',
    name: 'Dull Skin',
    categoryCode: 'SKIN_CONCERN',
    description: 'Lack of radiance from uneven surface reflection',
  },
  {
    code: 'ROUGH_TEXTURE',
    name: 'Rough Texture',
    categoryCode: 'SKIN_CONCERN',
    description: 'Uneven or coarse skin surface from buildup or damage',
  },
  {
    code: 'DEHYDRATED_SKIN',
    name: 'Dehydrated Skin',
    categoryCode: 'SKIN_CONCERN',
    description: 'Water loss causing tightness without necessarily low sebum',
  },
  {
    code: 'REDNESS',
    name: 'Redness',
    categoryCode: 'SKIN_CONCERN',
    description: 'Diffuse or localized erythema and flushing',
  },
  {
    code: 'ROSACEA',
    name: 'Rosacea',
    categoryCode: 'SKIN_CONCERN',
    description: 'Chronic inflammatory condition with redness and flushing',
  },
  {
    code: 'BARRIER_DAMAGE',
    name: 'Barrier Damage',
    categoryCode: 'SKIN_CONCERN',
    description: 'Compromised stratum corneum with increased sensitivity',
  },
  {
    code: 'DARK_CIRCLES',
    name: 'Dark Circles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Periorbital hyperpigmentation or shadowing',
  },
  {
    code: 'EYE_BAGS',
    name: 'Eye Bags',
    categoryCode: 'SKIN_CONCERN',
    description: 'Periorbital puffiness from fluid or fat prominence',
  },
  {
    code: 'UNEVEN_SKIN_TONE',
    name: 'Uneven Skin Tone',
    categoryCode: 'SKIN_CONCERN',
    description: 'Irregular coloration across facial skin areas',
  },

  // SKIN_GOAL
  {
    code: 'ACNE_TREATMENT',
    name: 'Acne Treatment',
    categoryCode: 'SKIN_GOAL',
    description: 'Reduce active breakouts and prevent new lesions',
  },
  {
    code: 'BRIGHTENING',
    name: 'Brightening',
    categoryCode: 'SKIN_GOAL',
    description: 'Improve skin luminosity and radiance',
  },
  {
    code: 'ANTI_AGING',
    name: 'Anti-aging',
    categoryCode: 'SKIN_GOAL',
    description: 'Address signs of photoaging and collagen decline',
  },
  {
    code: 'HYDRATION',
    name: 'Hydration',
    categoryCode: 'SKIN_GOAL',
    description: 'Increase skin water content and moisture retention',
  },
  {
    code: 'OIL_CONTROL',
    name: 'Oil Control',
    categoryCode: 'SKIN_GOAL',
    description: 'Regulate excess sebum production',
  },
  {
    code: 'BARRIER_REPAIR',
    name: 'Barrier Repair',
    categoryCode: 'SKIN_GOAL',
    description: 'Restore and strengthen the skin moisture barrier',
  },
  {
    code: 'REDUCE_PIGMENTATION',
    name: 'Reduce Pigmentation',
    categoryCode: 'SKIN_GOAL',
    description: 'Fade hyperpigmented spots and even discoloration',
  },
  {
    code: 'REDUCE_WRINKLES',
    name: 'Reduce Wrinkles',
    categoryCode: 'SKIN_GOAL',
    description: 'Minimize depth and appearance of wrinkles',
  },
  {
    code: 'REDUCE_REDNESS',
    name: 'Reduce Redness',
    categoryCode: 'SKIN_GOAL',
    description: 'Calm erythema and decrease visible flushing',
  },
  {
    code: 'IMPROVE_SKIN_TEXTURE',
    name: 'Improve Skin Texture',
    categoryCode: 'SKIN_GOAL',
    description: 'Smooth uneven or rough skin surface',
  },
  {
    code: 'EVEN_SKIN_TONE',
    name: 'Even Skin Tone',
    categoryCode: 'SKIN_GOAL',
    description: 'Balance overall facial color uniformity',
  },
  {
    code: 'MINIMIZE_PORES',
    name: 'Minimize Pores',
    categoryCode: 'SKIN_GOAL',
    description: 'Reduce the visible appearance of pore size',
  },

  // ALLERGY
  {
    code: 'FRAGRANCE',
    name: 'Fragrance',
    categoryCode: 'ALLERGY',
    description: 'Allergy or sensitivity to added fragrance compounds',
  },
  {
    code: 'ALCOHOL',
    name: 'Alcohol',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to denatured alcohol in formulations',
  },
  {
    code: 'ESSENTIAL_OIL',
    name: 'Essential Oil',
    categoryCode: 'ALLERGY',
    description: 'Reaction to botanical essential oil components',
  },
  {
    code: 'LANOLIN',
    name: 'Lanolin',
    categoryCode: 'ALLERGY',
    description: 'Allergy to wool-derived lanolin emollients',
  },
  {
    code: 'SALICYLIC_ACID',
    name: 'Salicylic Acid',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to beta hydroxy acid exfoliants',
  },
  {
    code: 'BENZOYL_PEROXIDE',
    name: 'Benzoyl Peroxide',
    categoryCode: 'ALLERGY',
    description: 'Irritation or allergy to benzoyl peroxide',
  },
  {
    code: 'RETINOIDS',
    name: 'Retinoids',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to retinol and retinoid derivatives',
  },
  {
    code: 'VITAMIN_C',
    name: 'Vitamin C',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to ascorbic acid or its derivatives',
  },
  {
    code: 'NIACINAMIDE',
    name: 'Niacinamide',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to vitamin B3 (niacinamide)',
  },

  // CONTRAINDICATION
  {
    code: 'PREGNANCY',
    name: 'Pregnancy',
    categoryCode: 'CONTRAINDICATION',
    description: 'Currently pregnant; restricts certain active ingredients',
  },
  {
    code: 'BREASTFEEDING',
    name: 'Breastfeeding',
    categoryCode: 'CONTRAINDICATION',
    description: 'Currently breastfeeding; restricts certain actives',
  },
  {
    code: 'OPEN_WOUND',
    name: 'Open Wound',
    categoryCode: 'CONTRAINDICATION',
    description: 'Broken or unhealed skin requiring actives to be avoided',
  },
  {
    code: 'ACTIVE_SKIN_INFECTION',
    name: 'Active Skin Infection',
    categoryCode: 'CONTRAINDICATION',
    description: 'Bacterial, viral, or fungal infection on treatment area',
  },
  {
    code: 'RECENT_CHEMICAL_PEEL',
    name: 'Recent Chemical Peel',
    categoryCode: 'CONTRAINDICATION',
    description: 'Chemical peel within the recovery window',
  },
  {
    code: 'RECENT_LASER_TREATMENT',
    name: 'Recent Laser Treatment',
    categoryCode: 'CONTRAINDICATION',
    description: 'Laser procedure within the required healing period',
  },
  {
    code: 'RECENT_MICRONEEDLING',
    name: 'Recent Microneedling',
    categoryCode: 'CONTRAINDICATION',
    description: 'Microneedling within the post-procedure recovery window',
  },

  // AGE_GROUP
  {
    code: 'UNDER_18',
    name: 'Under 18',
    categoryCode: 'AGE_GROUP',
    description: 'Customer is younger than 18 years old',
  },
  {
    code: 'AGE_18_25',
    name: '18–25',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 18 to 25 years',
  },
  {
    code: 'AGE_26_35',
    name: '26–35',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 26 to 35 years',
  },
  {
    code: 'AGE_36_45',
    name: '36–45',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 36 to 45 years',
  },
  {
    code: 'AGE_46_60',
    name: '46–60',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 46 to 60 years',
  },
  {
    code: 'ABOVE_60',
    name: 'Above 60',
    categoryCode: 'AGE_GROUP',
    description: 'Customer is older than 60 years',
  },

  // GENDER
  {
    code: 'MALE',
    name: 'Male',
    categoryCode: 'GENDER',
    description: 'Male gender',
  },
  {
    code: 'FEMALE',
    name: 'Female',
    categoryCode: 'GENDER',
    description: 'Female gender',
  },
  {
    code: 'NOT_PREFER_TO_SAY',
    name: 'Prefer not to say',
    categoryCode: 'GENDER',
    description: 'Customer prefers not to disclose gender',
  },

  // LIFESTYLE
  {
    code: 'OUTDOOR_LIFESTYLE',
    name: 'Outdoor Lifestyle',
    categoryCode: 'LIFESTYLE',
    description: 'Frequent outdoor daily activities and sun exposure',
  },
  {
    code: 'INDOOR_LIFESTYLE',
    name: 'Indoor Lifestyle',
    categoryCode: 'LIFESTYLE',
    description: 'Primarily indoor daily routine with limited sun exposure',
  },
  {
    code: 'NIGHT_SHIFT',
    name: 'Night Shift',
    categoryCode: 'LIFESTYLE',
    description: 'Regular overnight work disrupting circadian skin rhythm',
  },
  {
    code: 'HIGH_SUN_EXPOSURE',
    name: 'High Sun Exposure',
    categoryCode: 'LIFESTYLE',
    description: 'Prolonged unprotected ultraviolet exposure',
  },
  {
    code: 'HEAVY_MAKEUP',
    name: 'Heavy Makeup',
    categoryCode: 'LIFESTYLE',
    description: 'Daily full-coverage or long-wear cosmetic use',
  },
  {
    code: 'FREQUENT_EXERCISE',
    name: 'Frequent Exercise',
    categoryCode: 'LIFESTYLE',
    description: 'Regular physical activity with sweat and friction',
  },
  {
    code: 'AIR_CONDITIONED_ENVIRONMENT',
    name: 'Air-conditioned Environment',
    categoryCode: 'LIFESTYLE',
    description: 'Prolonged exposure to dry, climate-controlled air',
  },
  {
    code: 'SMOKING',
    name: 'Smoking',
    categoryCode: 'LIFESTYLE',
    description: 'Tobacco use affecting skin oxidative stress',
  },
  {
    code: 'HIGH_STRESS',
    name: 'High Stress',
    categoryCode: 'LIFESTYLE',
    description: 'Elevated chronic stress impacting skin inflammation',
  },

  // EXPERIENCE_LEVEL
  {
    code: 'BEGINNER',
    name: 'Beginner',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'New to active ingredients and multi-step routines',
  },
  {
    code: 'INTERMEDIATE',
    name: 'Intermediate',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'Comfortable with common actives at moderate strength',
  },
  {
    code: 'ADVANCED',
    name: 'Advanced',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'Experienced with potent actives and layered routines',
  },

  // PRODUCT_PREFERENCE
  {
    code: 'FRAGRANCE_FREE',
    name: 'Fragrance Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without added fragrance',
  },
  {
    code: 'ALCOHOL_FREE',
    name: 'Alcohol Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers formulations without denatured alcohol',
  },
  {
    code: 'ESSENTIAL_OIL_FREE',
    name: 'Essential Oil Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without essential oils',
  },
  {
    code: 'NON_COMEDOGENIC',
    name: 'Non-Comedogenic',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products unlikely to clog pores',
  },
  {
    code: 'HYPOALLERGENIC',
    name: 'Hypoallergenic',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers low-allergen formulated products',
  },
  {
    code: 'DERMATOLOGIST_TESTED',
    name: 'Dermatologist Tested',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers clinically or dermatologist-evaluated products',
  },
  {
    code: 'VEGAN',
    name: 'Vegan',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without animal-derived ingredients',
  },
  {
    code: 'CRUELTY_FREE',
    name: 'Cruelty Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products not tested on animals',
  },
];

const SKIN_TYPES = [
  {
    code: 'OSPW',
    name: 'Oily, Sensitive, Pigmented, Wrinkled',
    description: 'Baumann type OSPW',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'OSPT',
    name: 'Oily, Sensitive, Pigmented, Tight',
    description: 'Baumann type OSPT',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'OSNW',
    name: 'Oily, Sensitive, Non-pigmented, Wrinkled',
    description: 'Baumann type OSNW',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'OSNT',
    name: 'Oily, Sensitive, Non-pigmented, Tight',
    description: 'Baumann type OSNT',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'ORPW',
    name: 'Oily, Resistant, Pigmented, Wrinkled',
    description: 'Baumann type ORPW',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'ORPT',
    name: 'Oily, Resistant, Pigmented, Tight',
    description: 'Baumann type ORPT',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'ORNW',
    name: 'Oily, Resistant, Non-pigmented, Wrinkled',
    description: 'Baumann type ORNW',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'ORNT',
    name: 'Oily, Resistant, Non-pigmented, Tight',
    description: 'Baumann type ORNT',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DSPW',
    name: 'Dry, Sensitive, Pigmented, Wrinkled',
    description: 'Baumann type DSPW',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DSPT',
    name: 'Dry, Sensitive, Pigmented, Tight',
    description: 'Baumann type DSPT',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DSNW',
    name: 'Dry, Sensitive, Non-pigmented, Wrinkled',
    description: 'Baumann type DSNW',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DSNT',
    name: 'Dry, Sensitive, Non-pigmented, Tight',
    description: 'Baumann type DSNT',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DRPW',
    name: 'Dry, Resistant, Pigmented, Wrinkled',
    description: 'Baumann type DRPW',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DRPT',
    name: 'Dry, Resistant, Pigmented, Tight',
    description: 'Baumann type DRPT',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DRNW',
    name: 'Dry, Resistant, Non-pigmented, Wrinkled',
    description: 'Baumann type DRNW',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DRNT',
    name: 'Dry, Resistant, Non-pigmented, Tight',
    description: 'Baumann type DRNT',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
];

const PRODUCT_CATEGORIES: ProductCategorySeed[] = [
  {
    code: 'CLEANSER',
    name: 'Cleanser',
    description:
      'Face washes and cleansing products that remove dirt, oil, and makeup',
  },
  {
    code: 'TONER',
    name: 'Toner',
    description: 'Balancing toners and essences applied after cleansing',
  },
  {
    code: 'SERUM',
    name: 'Serum',
    description:
      'Concentrated treatment serums targeting specific skin concerns',
  },
  {
    code: 'MOISTURIZER',
    name: 'Moisturizer',
    description: 'Hydrating creams and lotions that support the skin barrier',
  },
  {
    code: 'SUNSCREEN',
    name: 'Sunscreen',
    description: 'UV protection products for daily sun defense',
  },
  {
    code: 'TREATMENT',
    name: 'Treatment',
    description:
      'Targeted treatments for acne, pigmentation, and other concerns',
  },
];

const PRODUCTS: ProductSeed[] = [
  {
    name: 'CeraVe Foaming Facial Cleanser',
    brandName: 'CeraVe',
    categoryCode: 'CLEANSER',
    description:
      'Gentle foaming cleanser for normal to oily skin with ceramides',
    sku: 'CERAVE-FOAM-CLEANSER-236ML',
    volume: '236ml',
    packaging: 'Pump bottle',
    priceVnd: 320000,
    ingredients: [
      { ingredientName: 'Ceramide', isKeyIngredient: true },
      { ingredientName: 'Niacinamide', concentrationPct: 2 },
    ],
  },
  {
    name: 'Some By Mi AHA BHA PHA 30 Days Miracle Toner',
    brandName: 'Some By Mi',
    categoryCode: 'TONER',
    description: 'Exfoliating toner with AHA, BHA, and PHA for clearer skin',
    sku: 'SOMEBYMI-MIRACLE-TONER-150ML',
    volume: '150ml',
    packaging: 'Bottle',
    priceVnd: 280000,
    ingredients: [
      {
        ingredientName: 'Glycolic Acid',
        concentrationPct: 7,
        isKeyIngredient: true,
      },
      { ingredientName: 'Salicylic Acid', concentrationPct: 2 },
    ],
  },
  {
    name: 'The Ordinary Niacinamide 10% + Zinc 1%',
    brandName: 'The Ordinary',
    categoryCode: 'SERUM',
    description: 'High-strength vitamin and mineral blemish formula',
    sku: 'TO-NIACINAMIDE-10-ZINC-30ML',
    volume: '30ml',
    packaging: 'Dropper bottle',
    priceVnd: 180000,
    ingredients: [
      {
        ingredientName: 'Niacinamide',
        concentrationPct: 10,
        isKeyIngredient: true,
      },
    ],
  },
  {
    name: 'CeraVe Moisturizing Cream',
    brandName: 'CeraVe',
    categoryCode: 'MOISTURIZER',
    description: 'Rich moisturizing cream with ceramides and hyaluronic acid',
    sku: 'CERAVE-MOIST-CREAM-454G',
    volume: '454g',
    packaging: 'Jar',
    priceVnd: 450000,
    ingredients: [
      { ingredientName: 'Ceramide', isKeyIngredient: true },
      { ingredientName: 'Hyaluronic Acid' },
    ],
  },
  {
    name: 'La Roche-Posay Anthelios UVMune 400 SPF50+',
    brandName: 'La Roche-Posay',
    categoryCode: 'SUNSCREEN',
    description: 'Broad-spectrum sunscreen with Mexoryl 400 for UVA protection',
    sku: 'LRP-ANTHELIOS-UVMUNE-50ML',
    volume: '50ml',
    packaging: 'Tube',
    priceVnd: 520000,
    ingredients: [{ ingredientName: 'Hyaluronic Acid' }],
  },
  {
    name: 'La Roche-Posay Effaclar Duo+ Anti-Acne Treatment',
    brandName: 'La Roche-Posay',
    categoryCode: 'TREATMENT',
    description:
      'Dual-action acne treatment with benzoyl peroxide and niacinamide',
    sku: 'LRP-EFFAC-DUO-40ML',
    volume: '40ml',
    packaging: 'Tube',
    priceVnd: 380000,
    ingredients: [
      {
        ingredientName: 'Benzoyl Peroxide',
        concentrationPct: 2.5,
        isKeyIngredient: true,
      },
      { ingredientName: 'Azelaic Acid', concentrationPct: 10 },
    ],
  },
];

const DELIVERY_PROVIDERS = [
  { code: 'GHN', name: 'Giao Hàng Nhanh' },
  { code: 'GHTK', name: 'Giao Hàng Tiết Kiệm' },
  { code: 'VIETTEL_POST', name: 'Viettel Post' },
  { code: 'JT_EXPRESS', name: 'J&T Express' },
];

const SUPPORT_HABITS = [
  {
    code: 'face_yoga',
    name: 'Face Yoga',
    type: SupportHabitType.FACE_YOGA,
  },
  {
    code: 'facial_massage',
    name: 'Facial Massage',
    type: SupportHabitType.FACIAL_MASSAGE,
  },
  {
    code: 'hydration',
    name: 'Drink Water',
    type: SupportHabitType.HYDRATION,
  },
  { code: 'sleep', name: 'Sleep Routine', type: SupportHabitType.SLEEP },
];

const INGREDIENTS: IngredientSeed[] = [
  {
    name: 'Niacinamide',
    ingredientType: 'vitamin',
    isActiveIngredient: true,
    description: 'Vitamin B3; helps regulate sebum and even tone',
  },
  {
    name: 'Retinol',
    ingredientType: 'retinoid',
    isActiveIngredient: true,
    description: 'Vitamin A derivative for cell turnover',
  },
  {
    name: 'Salicylic Acid',
    ingredientType: 'bha',
    isActiveIngredient: true,
    description: 'Beta hydroxy acid for pore clearing',
  },
  {
    name: 'Ceramide',
    ingredientType: 'lipid',
    isActiveIngredient: false,
    description: 'Barrier-repair lipid',
  },
  {
    name: 'Hyaluronic Acid',
    ingredientType: 'humectant',
    isActiveIngredient: false,
    description: 'Hydrating humectant',
  },
  {
    name: 'Glycolic Acid',
    ingredientType: 'aha',
    isActiveIngredient: true,
    description: 'Alpha hydroxy acid for exfoliation',
  },
  {
    name: 'Azelaic Acid',
    ingredientType: 'dicarboxylic_acid',
    isActiveIngredient: true,
    description: 'Anti-inflammatory; helps acne and redness',
  },
  {
    name: 'Benzoyl Peroxide',
    ingredientType: 'antimicrobial',
    isActiveIngredient: true,
    description: 'Antibacterial agent for acne',
  },
];

const PROTOCOL_LABEL_MAPPINGS: Array<{
  protocolCode: string;
  labelCode: string;
  matchType: LabelMatchType;
}> = [
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'ANTI_AGING',
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
    protocolCode: 'ceramide_barrier',
    labelCode: 'BARRIER_REPAIR',
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
];

const PROTOCOL_CONFLICTS: Array<{
  protocolCode: string;
  conflictingProtocolCode: string;
  severity: ConflictSeverity;
  reason: string;
}> = [
  {
    protocolCode: 'retinol_0.3_anti_aging',
    conflictingProtocolCode: 'glycolic_exfoliation',
    severity: ConflictSeverity.HIGH,
    reason: 'Retinol + AHA may cause excessive irritation',
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    conflictingProtocolCode: 'salicylic_acne',
    severity: ConflictSeverity.MEDIUM,
    reason: 'Combining retinol with BHA may increase dryness',
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    conflictingProtocolCode: 'benzoyl_acne',
    severity: ConflictSeverity.HIGH,
    reason: 'Benzoyl peroxide can deactivate retinol',
  },
];

type ExpertSeed = {
  keycloakSub: string;
  email: string;
  name: string;
  specialization: ExpertSpecialty;
  licenseNumber: string;
  bio: string;
  rating: number;
  consultationFee: number;
  sessionLengthHours: number;
};

/** Mon-Fri recurring availability blocks (dayOfWeek 1-5). */
const DEFAULT_EXPERT_AVAILABILITY: Array<{
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}> = [
  { dayOfWeek: 1, startHour: 9, endHour: 12 },
  { dayOfWeek: 1, startHour: 13, endHour: 18 },
  { dayOfWeek: 2, startHour: 9, endHour: 12 },
  { dayOfWeek: 2, startHour: 13, endHour: 18 },
  { dayOfWeek: 3, startHour: 9, endHour: 12 },
  { dayOfWeek: 3, startHour: 13, endHour: 18 },
  { dayOfWeek: 4, startHour: 9, endHour: 12 },
  { dayOfWeek: 4, startHour: 13, endHour: 18 },
  { dayOfWeek: 5, startHour: 9, endHour: 12 },
  { dayOfWeek: 5, startHour: 13, endHour: 18 },
];

type ClinicSeed = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  experts: ExpertSeed[];
};

const CLINICS: ClinicSeed[] = [
  {
    name: 'GlowScan District 1 Clinic',
    address: '12 Nguyen Hue, District 1, Ho Chi Minh City',
    latitude: 10.7769,
    longitude: 106.7009,
    experts: [
      {
        keycloakSub: 'seed-expert-d1-derma',
        email: 'derma.d1@glowscan.example.com',
        name: 'Dr. Nguyen Van An',
        specialization: ExpertSpecialty.DERMATOLOGY,
        licenseNumber: 'LIC-D1-001',
        bio: 'Board-certified dermatologist with 12 years of clinical experience.',
        rating: 4.8,
        consultationFee: 400000,
        sessionLengthHours: 1,
      },
      {
        keycloakSub: 'seed-expert-d1-acne',
        email: 'acne.d1@glowscan.example.com',
        name: 'Dr. Tran Thi Bich',
        specialization: ExpertSpecialty.ACNE_TREATMENT,
        licenseNumber: 'LIC-D1-002',
        bio: 'Specialist in inflammatory acne and scar management.',
        rating: 4.6,
        consultationFee: 350000,
        sessionLengthHours: 2,
      },
      {
        keycloakSub: 'seed-expert-d1-laser',
        email: 'laser.d1@glowscan.example.com',
        name: 'Dr. Le Minh Cuong',
        specialization: ExpertSpecialty.LASER_THERAPY,
        licenseNumber: 'LIC-D1-003',
        bio: 'Laser and light-based therapy expert for pigmentation and rejuvenation.',
        rating: 4.7,
        consultationFee: 500000,
        sessionLengthHours: 1,
      },
    ],
  },
  {
    name: 'GlowScan District 3 Clinic',
    address: '88 Vo Van Tan, District 3, Ho Chi Minh City',
    latitude: 10.7797,
    longitude: 106.6899,
    experts: [
      {
        keycloakSub: 'seed-expert-d3-cosmetic',
        email: 'cosmetic.d3@glowscan.example.com',
        name: 'Dr. Pham Thu Ha',
        specialization: ExpertSpecialty.COSMETIC_DERMATOLOGY,
        licenseNumber: 'LIC-D3-001',
        bio: 'Cosmetic dermatologist focused on non-invasive facial aesthetics.',
        rating: 4.9,
        consultationFee: 550000,
        sessionLengthHours: 2,
      },
      {
        keycloakSub: 'seed-expert-d3-antiaging',
        email: 'antiaging.d3@glowscan.example.com',
        name: 'Dr. Hoang Quoc Dat',
        specialization: ExpertSpecialty.ANTI_AGING,
        licenseNumber: 'LIC-D3-002',
        bio: 'Anti-aging medicine specialist with a focus on collagen restoration.',
        rating: 4.5,
        consultationFee: 450000,
        sessionLengthHours: 1,
      },
      {
        keycloakSub: 'seed-expert-d3-pigment',
        email: 'pigment.d3@glowscan.example.com',
        name: 'Dr. Vo Thi Kim',
        specialization: ExpertSpecialty.PIGMENTATION,
        licenseNumber: 'LIC-D3-003',
        bio: 'Pigmentation disorder specialist treating melasma and PIH.',
        rating: 4.4,
        consultationFee: 380000,
        sessionLengthHours: 2,
      },
    ],
  },
];

async function upsertLabelCategory(
  repo: ReturnType<typeof AppDataSource.getRepository<LabelCategory>>,
  seed: LabelCategorySeed,
): Promise<LabelCategory> {
  let row = await repo.findOneBy({ code: seed.code });
  if (!row) {
    row = repo.create(seed);
    return repo.save(row);
  }
  row.name = seed.name;
  row.description = seed.description;
  return repo.save(row);
}

async function upsertLabel(
  repo: ReturnType<typeof AppDataSource.getRepository<Label>>,
  seed: LabelSeed,
  categoryId: string,
): Promise<Label> {
  let row = await repo.findOneBy({ code: seed.code });
  if (!row) {
    row = repo.create({
      code: seed.code,
      name: seed.name,
      description: seed.description,
      categoryId,
      isActive: seed.isActive ?? true,
    });
    return repo.save(row);
  }
  row.name = seed.name;
  row.description = seed.description;
  row.categoryId = categoryId;
  row.isActive = seed.isActive ?? true;
  return repo.save(row);
}

async function upsertIngredient(
  repo: ReturnType<typeof AppDataSource.getRepository<Ingredient>>,
  seed: IngredientSeed,
): Promise<Ingredient> {
  let ingredient = await repo.findOneBy({ name: seed.name });
  if (!ingredient) {
    ingredient = repo.create(seed);
    return repo.save(ingredient);
  }
  ingredient.ingredientType = seed.ingredientType;
  ingredient.isActiveIngredient = seed.isActiveIngredient;
  ingredient.description = seed.description ?? null;
  return repo.save(ingredient);
}

async function upsertProtocol(
  repo: ReturnType<typeof AppDataSource.getRepository<IngredientProtocol>>,
  code: string,
  name: string,
  ingredientId: string,
  concentrationPct?: number,
  timePerWeek?: number,
  timeOfUse?: TimeOfUse,
  durationWeeks?: number | null,
): Promise<IngredientProtocol> {
  let protocol = await repo.findOneBy({ code });
  if (!protocol) {
    protocol = repo.create({
      code,
      name,
      ingredientId,
      concentrationPct: concentrationPct ?? null,
      timePerWeek: timePerWeek ?? null,
      timeOfUse: timeOfUse ?? null,
      durationWeeks: durationWeeks ?? null,
      isActive: true,
    });
    return repo.save(protocol);
  }
  protocol.name = name;
  protocol.ingredientId = ingredientId;
  protocol.concentrationPct = concentrationPct ?? null;
  protocol.timePerWeek = timePerWeek ?? null;
  protocol.timeOfUse = timeOfUse ?? null;
  protocol.durationWeeks = durationWeeks ?? null;
  return repo.save(protocol);
}

async function upsertProductCategory(
  repo: ReturnType<typeof AppDataSource.getRepository<ProductCategory>>,
  seed: ProductCategorySeed,
): Promise<ProductCategory> {
  let row = await repo.findOneBy({ code: seed.code });
  if (!row) {
    row = repo.create({ ...seed, isActive: true });
    return repo.save(row);
  }
  row.name = seed.name;
  row.description = seed.description;
  row.isActive = true;
  return repo.save(row);
}

async function upsertProductBrand(
  repo: ReturnType<typeof AppDataSource.getRepository<ProductBrand>>,
  name: string,
): Promise<ProductBrand> {
  let brand = await repo.findOneBy({ name });
  if (!brand) {
    brand = repo.create({ name, isActive: true });
    return repo.save(brand);
  }
  brand.isActive = true;
  return repo.save(brand);
}

async function upsertProductWithVariant(
  productRepo: ReturnType<typeof AppDataSource.getRepository<Product>>,
  variantRepo: ReturnType<typeof AppDataSource.getRepository<ProductVariant>>,
  productIngredientRepo: ReturnType<
    typeof AppDataSource.getRepository<ProductIngredient>
  >,
  seed: ProductSeed,
  brandId: string,
  categoryId: string,
  ingredientsByName: Map<string, Ingredient>,
): Promise<void> {
  const variant = await variantRepo.findOne({
    where: { sku: seed.sku },
    relations: ['product'],
  });

  let product: Product;
  if (variant) {
    product = variant.product;
    product.name = seed.name;
    product.brandId = brandId;
    product.categoryId = categoryId;
    product.description = seed.description;
    product.isActive = true;
    product = await productRepo.save(product);

    variant.volume = seed.volume ?? null;
    variant.packaging = seed.packaging ?? null;
    variant.priceVnd = seed.priceVnd;
    variant.shelfLifeValue = seed.shelfLifeValue ?? 365;
    variant.shelfLifeUnit = seed.shelfLifeUnit ?? ShelfLifeUnit.DAY;
    variant.isActive = true;
    await variantRepo.save(variant);
  } else {
    product = await productRepo.save(
      productRepo.create({
        name: seed.name,
        brandId,
        categoryId,
        description: seed.description,
        isActive: true,
      }),
    );

    await variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: seed.sku,
        volume: seed.volume ?? null,
        packaging: seed.packaging ?? null,
        priceVnd: seed.priceVnd,
        shelfLifeValue: seed.shelfLifeValue ?? 365,
        shelfLifeUnit: seed.shelfLifeUnit ?? ShelfLifeUnit.DAY,
        isActive: true,
      }),
    );
  }

  for (const ingredientSeed of seed.ingredients) {
    const ingredient = ingredientsByName.get(ingredientSeed.ingredientName);
    if (!ingredient) continue;

    const existing = await productIngredientRepo.findOneBy({
      productId: product.id,
      ingredientId: ingredient.id,
    });
    if (!existing) {
      await productIngredientRepo.save(
        productIngredientRepo.create({
          productId: product.id,
          ingredientId: ingredient.id,
          concentrationPct: ingredientSeed.concentrationPct ?? null,
          isKeyIngredient: ingredientSeed.isKeyIngredient ?? false,
        }),
      );
    } else {
      existing.concentrationPct = ingredientSeed.concentrationPct ?? null;
      existing.isKeyIngredient = ingredientSeed.isKeyIngredient ?? false;
      await productIngredientRepo.save(existing);
    }
  }
}

async function seed(): Promise<void> {
  await AppDataSource.initialize();

  const labelCategoryRepo = AppDataSource.getRepository(LabelCategory);
  const labelRepo = AppDataSource.getRepository(Label);
  const skinTypeRepo = AppDataSource.getRepository(SkinType);
  const productCategoryRepo = AppDataSource.getRepository(ProductCategory);
  const productBrandRepo = AppDataSource.getRepository(ProductBrand);
  const productRepo = AppDataSource.getRepository(Product);
  const productVariantRepo = AppDataSource.getRepository(ProductVariant);
  const productIngredientRepo = AppDataSource.getRepository(ProductIngredient);
  const deliveryProviderRepo = AppDataSource.getRepository(DeliveryProvider);
  const supportHabitRepo = AppDataSource.getRepository(SupportHabit);
  const ingredientRepo = AppDataSource.getRepository(Ingredient);
  const protocolRepo = AppDataSource.getRepository(IngredientProtocol);
  const protocolLabelRepo = AppDataSource.getRepository(ProtocolLabel);
  const conflictRepo = AppDataSource.getRepository(IngredientConflict);
  const clinicRepo = AppDataSource.getRepository(Clinic);
  const userRepo = AppDataSource.getRepository(User);
  const expertRepo = AppDataSource.getRepository(Expert);
  const availabilityRepo = AppDataSource.getRepository(ExpertAvailability);

  const categoriesByCode = new Map<string, LabelCategory>();
  for (const cat of LABEL_CATEGORIES) {
    const row = await upsertLabelCategory(labelCategoryRepo, cat);
    categoriesByCode.set(row.code, row);
  }

  const labelsByCode = new Map<string, Label>();
  for (const labelSeed of LABELS) {
    const category = categoriesByCode.get(labelSeed.categoryCode);
    if (!category) continue;
    const row = await upsertLabel(labelRepo, labelSeed, category.id);
    labelsByCode.set(row.code, row);
  }

  for (const st of SKIN_TYPES) {
    const existing = await skinTypeRepo.findOneBy({ code: st.code });
    if (!existing) {
      await skinTypeRepo.save(skinTypeRepo.create(st));
    }
  }

  const productCategoriesByCode = new Map<string, ProductCategory>();
  for (const pc of PRODUCT_CATEGORIES) {
    const row = await upsertProductCategory(productCategoryRepo, pc);
    productCategoriesByCode.set(row.code, row);
  }

  for (const dp of DELIVERY_PROVIDERS) {
    const existing = await deliveryProviderRepo.findOneBy({ code: dp.code });
    if (!existing) {
      await deliveryProviderRepo.save(
        deliveryProviderRepo.create({ ...dp, isActive: true }),
      );
    }
  }

  for (const habit of SUPPORT_HABITS) {
    const existing = await supportHabitRepo.findOneBy({ code: habit.code });
    if (!existing) {
      await supportHabitRepo.save(supportHabitRepo.create(habit));
    }
  }

  const ingredientsByName = new Map<string, Ingredient>();
  for (const ingredientSeed of INGREDIENTS) {
    const ingredient = await upsertIngredient(ingredientRepo, ingredientSeed);
    ingredientsByName.set(ingredient.name, ingredient);
  }

  for (const productSeed of PRODUCTS) {
    const category = productCategoriesByCode.get(productSeed.categoryCode);
    if (!category) continue;

    const brand = await upsertProductBrand(
      productBrandRepo,
      productSeed.brandName,
    );
    await upsertProductWithVariant(
      productRepo,
      productVariantRepo,
      productIngredientRepo,
      productSeed,
      brand.id,
      category.id,
      ingredientsByName,
    );
  }

  const protocolsByCode = new Map<string, IngredientProtocol>();
  const protocolDefs: Array<{
    code: string;
    name: string;
    ingredientName: string;
    concentrationPct?: number;
    timePerWeek?: number;
    timeOfUse?: TimeOfUse;
    durationWeeks?: number | null;
  }> = [
    {
      code: 'retinol_0.3_anti_aging',
      name: 'Retinol 0.3% Anti-Aging',
      ingredientName: 'Retinol',
      concentrationPct: 0.3,
      timePerWeek: 3,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: 12,
    },
    {
      code: 'salicylic_acne',
      name: 'Salicylic Acid 2% Acne',
      ingredientName: 'Salicylic Acid',
      concentrationPct: 2,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: 8,
    },
    {
      code: 'azelaic_pigmentation',
      name: 'Azelaic Acid 10% Pigmentation',
      ingredientName: 'Azelaic Acid',
      concentrationPct: 10,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: 12,
    },
    {
      code: 'ceramide_barrier',
      name: 'Ceramide Barrier Repair',
      ingredientName: 'Ceramide',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
    },
    {
      code: 'ha_hydration',
      name: 'Hyaluronic Acid Hydration',
      ingredientName: 'Hyaluronic Acid',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
    },
    {
      code: 'niacinamide_general',
      name: 'Niacinamide 5% General',
      ingredientName: 'Niacinamide',
      concentrationPct: 5,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
    },
    {
      code: 'glycolic_exfoliation',
      name: 'Glycolic Acid 7% Exfoliation',
      ingredientName: 'Glycolic Acid',
      concentrationPct: 7,
      timePerWeek: 2,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: 8,
    },
    {
      code: 'benzoyl_acne',
      name: 'Benzoyl Peroxide 2.5% Acne',
      ingredientName: 'Benzoyl Peroxide',
      concentrationPct: 2.5,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM,
      durationWeeks: 8,
    },
  ];

  for (const def of protocolDefs) {
    const ingredient = ingredientsByName.get(def.ingredientName);
    if (!ingredient) continue;
    const protocol = await upsertProtocol(
      protocolRepo,
      def.code,
      def.name,
      ingredient.id,
      def.concentrationPct,
      def.timePerWeek,
      def.timeOfUse,
      def.durationWeeks,
    );
    protocolsByCode.set(protocol.code, protocol);
  }

  for (const mapping of PROTOCOL_LABEL_MAPPINGS) {
    const protocol = protocolsByCode.get(mapping.protocolCode);
    const label = labelsByCode.get(mapping.labelCode);
    if (!protocol || !label) continue;

    const existing = await protocolLabelRepo.findOneBy({
      protocolId: protocol.id,
      labelId: label.id,
    });
    if (!existing) {
      await protocolLabelRepo.save(
        protocolLabelRepo.create({
          protocolId: protocol.id,
          labelId: label.id,
          matchType: mapping.matchType,
        }),
      );
    } else {
      existing.matchType = mapping.matchType;
      await protocolLabelRepo.save(existing);
    }
  }

  for (const conflict of PROTOCOL_CONFLICTS) {
    const protocol = protocolsByCode.get(conflict.protocolCode);
    const conflicting = protocolsByCode.get(conflict.conflictingProtocolCode);
    if (!protocol || !conflicting) continue;

    const existing = await conflictRepo.findOneBy({
      protocolId: protocol.id,
      conflictingProtocolId: conflicting.id,
    });
    if (!existing) {
      await conflictRepo.save(
        conflictRepo.create({
          protocolId: protocol.id,
          conflictingProtocolId: conflicting.id,
          severity: conflict.severity,
          reason: conflict.reason,
        }),
      );
    } else {
      existing.severity = conflict.severity;
      existing.reason = conflict.reason;
      await conflictRepo.save(existing);
    }
  }

  for (const clinicSeed of CLINICS) {
    let clinic = await clinicRepo.findOneBy({ name: clinicSeed.name });
    if (!clinic) {
      clinic = await clinicRepo.save(
        clinicRepo.create({
          name: clinicSeed.name,
          address: clinicSeed.address,
          latitude: clinicSeed.latitude,
          longitude: clinicSeed.longitude,
          isActive: true,
        }),
      );
    } else {
      clinic.address = clinicSeed.address;
      clinic.latitude = clinicSeed.latitude;
      clinic.longitude = clinicSeed.longitude;
      clinic.isActive = true;
      clinic = await clinicRepo.save(clinic);
    }

    for (const expertSeed of clinicSeed.experts) {
      let user = await userRepo.findOneBy({
        keycloakSub: expertSeed.keycloakSub,
      });
      if (!user) {
        user = await userRepo.save(
          userRepo.create({
            keycloakSub: expertSeed.keycloakSub,
            email: expertSeed.email,
            name: expertSeed.name,
            provider: 'keycloak',
            roles: [Role.Expert],
            clinicId: clinic.id,
            isActive: true,
          }),
        );
      } else {
        user.email = expertSeed.email;
        user.name = expertSeed.name;
        user.roles = [Role.Expert];
        user.clinicId = clinic.id;
        user.isActive = true;
        user = await userRepo.save(user);
      }

      const expert = await expertRepo.findOneBy({ userId: user.id });
      let savedExpert: Expert;
      if (!expert) {
        savedExpert = await expertRepo.save(
          expertRepo.create({
            userId: user.id,
            clinicId: clinic.id,
            specialization: expertSeed.specialization,
            licenseNumber: expertSeed.licenseNumber,
            bio: expertSeed.bio,
            rating: expertSeed.rating,
            consultationFee: expertSeed.consultationFee,
            sessionLengthHours: expertSeed.sessionLengthHours,
            isActive: true,
          }),
        );
      } else {
        expert.clinicId = clinic.id;
        expert.specialization = expertSeed.specialization;
        expert.licenseNumber = expertSeed.licenseNumber;
        expert.bio = expertSeed.bio;
        expert.rating = expertSeed.rating;
        expert.consultationFee = expertSeed.consultationFee;
        expert.sessionLengthHours = expertSeed.sessionLengthHours;
        expert.isActive = true;
        savedExpert = await expertRepo.save(expert);
      }

      await availabilityRepo.delete({ expertId: savedExpert.id });
      for (const block of DEFAULT_EXPERT_AVAILABILITY) {
        await availabilityRepo.save(
          availabilityRepo.create({
            expertId: savedExpert.id,
            dayOfWeek: block.dayOfWeek,
            startHour: block.startHour,
            endHour: block.endHour,
          }),
        );
      }
    }
  }

  // Demo customer + a PENDING order for payment-flow testing (see docs/payments.md).
  const customerRepo = AppDataSource.getRepository(Customer);
  const orderRepo = AppDataSource.getRepository(Order);

  let demoUser = await userRepo.findOneBy({
    keycloakSub: 'seed-customer-demo',
  });
  if (!demoUser) {
    demoUser = await userRepo.save(
      userRepo.create({
        keycloakSub: 'seed-customer-demo',
        email: 'demo.customer@glowscan.example.com',
        name: 'Demo Customer',
        provider: 'keycloak',
        roles: [Role.Customer],
        isActive: true,
      }),
    );
  }

  let demoCustomer = await customerRepo.findOneBy({ userId: demoUser.id });
  if (!demoCustomer) {
    demoCustomer = await customerRepo.save(
      customerRepo.create({ userId: demoUser.id }),
    );
  }

  const existingPendingOrder = await orderRepo.findOneBy({
    customerId: demoCustomer.id,
    status: OrderStatus.PENDING,
  });
  if (!existingPendingOrder) {
    const order = await orderRepo.save(
      orderRepo.create({
        customerId: demoCustomer.id,
        status: OrderStatus.PENDING,
        totalVnd: 199000,
      }),
    );
    console.log(`Seeded PENDING order ${order.id} for demo customer`);
  }

  console.log('Seed completed successfully');
  await AppDataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error('Seed failed', err);
  void AppDataSource.destroy();
  process.exit(1);
});
