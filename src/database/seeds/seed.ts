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
import { ProductProtocol } from '../../products/product-protocol.entity';
import {
  ShelfLifeUnit,
  ProductInstanceStatus,
  StockMovementType,
} from '../../stock/enums';
import { StockBatch } from '../../stock/stock-batch.entity';
import { ProductInstance } from '../../stock/product-instance.entity';
import { StockMovement } from '../../stock/stock-movement.entity';
import { DEFAULT_ITEM_WEIGHT_GRAM } from '../../delivery/ghn.constants';
import {
  Question,
  QuestionAskWhen,
  QuestionPriority,
} from '../../survey/question.entity';
import { QuestionOption } from '../../survey/question-option.entity';
import { CommerceSetting } from '../../commerce/commerce-setting.entity';
import {
  CommerceSettingKey,
  OrderSource,
  OrderStatus,
} from '../../commerce/enums';
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

type LabelCategorySeed = {
  code: string;
  name: string;
  description: string;
  vietnameseNormalized: string;
};
type LabelSeed = {
  code: string;
  name: string;
  categoryCode: string;
  description: string;
  vietnameseNormalized: string;
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
  /** Parcel weight in grams. Defaults to a value derived from `volume`. */
  weightGram?: number;
  ingredients: ProductIngredientSeed[];
};

/** Packaging (bottle, pump, box) on top of the product's own volume. */
const PACKAGING_WEIGHT_GRAM = 40;

/**
 * Approximates shipping weight from a volume string like '236ml', treating 1ml as 1g
 * and adding packaging. Good enough for a GHN fee quote; set `weightGram` on the seed
 * to override for anything unusual.
 */
function deriveWeightGram(seed: ProductSeed): number {
  if (seed.weightGram) {
    return seed.weightGram;
  }
  const ml = Number.parseFloat(seed.volume ?? '');
  return Number.isFinite(ml) && ml > 0
    ? Math.round(ml) + PACKAGING_WEIGHT_GRAM
    : DEFAULT_ITEM_WEIGHT_GRAM;
}

const LABEL_CATEGORIES: LabelCategorySeed[] = [
  {
    code: 'SKIN_CONCERN',
    name: 'Skin Concern',
    description: 'Observed skin conditions and dermatologic concerns',
    vietnameseNormalized: 'Vấn đề về da',
  },
  {
    code: 'SKIN_GOAL',
    name: 'Skin Goal',
    description: 'Desired treatment outcomes for skincare routines',
    vietnameseNormalized: 'Mục tiêu chăm sóc da',
  },
  {
    code: 'ALLERGY',
    name: 'Allergy',
    description: 'Known cosmetic or skincare ingredient allergies',
    vietnameseNormalized: 'Dị ứng thành phần',
  },
  {
    code: 'CONTRAINDICATION',
    name: 'Contraindication',
    description: 'Clinical or procedural factors that restrict treatment',
    vietnameseNormalized: 'Chống chỉ định',
  },
  {
    code: 'AGE_GROUP',
    name: 'Age Group',
    description: 'Customer age range for protocol suitability',
    vietnameseNormalized: 'Độ tuổi',
  },
  {
    code: 'GENDER',
    name: 'Gender',
    description: 'Customer gender for protocol suitability',
    vietnameseNormalized: 'Giới tính',
  },
  {
    code: 'LIFESTYLE',
    name: 'Lifestyle',
    description: 'Environmental and behavioral lifestyle factors',
    vietnameseNormalized: 'Thói quen sinh hoạt',
  },
  {
    code: 'EXPERIENCE_LEVEL',
    name: 'Experience Level',
    description: 'Customer familiarity with active skincare ingredients',
    vietnameseNormalized: 'Kinh nghiệm dưỡng da',
  },
  {
    code: 'PRODUCT_PREFERENCE',
    name: 'Product Preference',
    description: 'Formulation and product attribute preferences',
    vietnameseNormalized: 'Sở thích sản phẩm',
  },
  {
    code: 'SKIN_TYPE_SIGNAL',
    name: 'Skin Type Signal',
    description: 'Baumann axis signals from symptom-based survey answers',
    vietnameseNormalized: 'Tín hiệu loại da',
  },
  {
    code: 'ROUTINE',
    name: 'Routine',
    description: 'Current skincare routine habits and coverage',
    vietnameseNormalized: 'Routine chăm sóc da',
  },
  {
    code: 'ACTIVE_USAGE',
    name: 'Active Usage',
    description: 'Active ingredients currently used and tolerance signals',
    vietnameseNormalized: 'Hoạt chất đang dùng',
  },
  {
    code: 'PERSONALITY',
    name: 'Personality',
    description: 'Routine personality, risk tolerance, and preference signals',
    vietnameseNormalized: 'Tính cách chăm sóc da',
  },
  {
    code: 'SAFETY_CONTEXT',
    name: 'Safety Context',
    description: 'Non-diagnosis safety and medical-context survey signals',
    vietnameseNormalized: 'Bối cảnh an toàn',
  },
];

const LABELS: LabelSeed[] = [
  // SKIN_CONCERN
  {
    code: 'ACNE',
    name: 'Acne',
    categoryCode: 'SKIN_CONCERN',
    description: 'Inflammatory and non-inflammatory acne lesions',
    vietnameseNormalized: 'Mụn sưng, mụn viêm hoặc mụn trứng cá',
  },
  {
    code: 'BLACKHEADS',
    name: 'Blackheads',
    categoryCode: 'SKIN_CONCERN',
    description: 'Open comedones caused by oxidized sebum in pores',
    vietnameseNormalized: 'Mụn đầu đen, mụn cám',
  },
  {
    code: 'WHITEHEADS',
    name: 'Whiteheads',
    categoryCode: 'SKIN_CONCERN',
    description: 'Closed comedones with trapped sebum beneath the skin',
    vietnameseNormalized: 'Mụn ẩn, mụn đầu trắng',
  },
  {
    code: 'ENLARGED_PORES',
    name: 'Enlarged Pores',
    categoryCode: 'SKIN_CONCERN',
    description: 'Visibly dilated follicular openings',
    vietnameseNormalized: 'Lỗ chân lông to',
  },
  {
    code: 'HYPERPIGMENTATION',
    name: 'Hyperpigmentation',
    categoryCode: 'SKIN_CONCERN',
    description: 'Excess melanin deposition causing darkened skin patches',
    vietnameseNormalized: 'Thâm sạm, đốm nâu',
  },
  {
    code: 'MELASMA',
    name: 'Melasma',
    categoryCode: 'SKIN_CONCERN',
    description: 'Symmetric hormonally influenced facial hyperpigmentation',
    vietnameseNormalized: 'Nám da mặt',
  },
  {
    code: 'FRECKLES',
    name: 'Freckles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Small ephelides from sun-induced melanin clusters',
    vietnameseNormalized: 'Tàn nhang',
  },
  {
    code: 'POST_INFLAMMATORY_HYPERPIGMENTATION',
    name: 'Post-inflammatory Hyperpigmentation',
    categoryCode: 'SKIN_CONCERN',
    description: 'Dark marks remaining after inflammatory skin injury (PIH)',
    vietnameseNormalized: 'Vết thâm đen, thâm nâu sau mụn',
  },
  {
    code: 'POST_INFLAMMATORY_ERYTHEMA',
    name: 'Post-inflammatory Erythema',
    categoryCode: 'SKIN_CONCERN',
    description: 'Persistent redness after inflammatory skin injury (PIE)',
    vietnameseNormalized: 'Vết thâm đỏ, hồng đỏ sau mụn',
  },
  {
    code: 'WRINKLES',
    name: 'Wrinkles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Visible creases from collagen and elastin loss',
    vietnameseNormalized: 'Nếp nhăn rõ rệt',
  },
  {
    code: 'FINE_LINES',
    name: 'Fine Lines',
    categoryCode: 'SKIN_CONCERN',
    description: 'Early superficial lines from dehydration or photoaging',
    vietnameseNormalized: 'Rãnh nhăn nông, nếp nhăn mờ',
  },
  {
    code: 'DULL_SKIN',
    name: 'Dull Skin',
    categoryCode: 'SKIN_CONCERN',
    description: 'Lack of radiance from uneven surface reflection',
    vietnameseNormalized: 'Da xỉn màu, thiếu sức sống',
  },
  {
    code: 'ROUGH_TEXTURE',
    name: 'Rough Texture',
    categoryCode: 'SKIN_CONCERN',
    description: 'Uneven or coarse skin surface from buildup or damage',
    vietnameseNormalized: 'Bề mặt da sần sùi, thô ráp',
  },
  {
    code: 'DEHYDRATED_SKIN',
    name: 'Dehydrated Skin',
    categoryCode: 'SKIN_CONCERN',
    description: 'Water loss causing tightness without necessarily low sebum',
    vietnameseNormalized: 'Da khô căng, thiếu nước',
  },
  {
    code: 'REDNESS',
    name: 'Redness',
    categoryCode: 'SKIN_CONCERN',
    description: 'Diffuse or localized erythema and flushing',
    vietnameseNormalized: 'Da hay bị ửng đỏ rát',
  },
  {
    code: 'ROSACEA',
    name: 'Rosacea',
    categoryCode: 'SKIN_CONCERN',
    description: 'Chronic inflammatory condition with redness and flushing',
    vietnameseNormalized: 'Da mẩn đỏ nhạy cảm mạn tính',
  },
  {
    code: 'BARRIER_DAMAGE',
    name: 'Barrier Damage',
    categoryCode: 'SKIN_CONCERN',
    description: 'Compromised stratum corneum with increased sensitivity',
    vietnameseNormalized: 'Hàng rào bảo vệ da bị tổn thương',
  },
  {
    code: 'DARK_CIRCLES',
    name: 'Dark Circles',
    categoryCode: 'SKIN_CONCERN',
    description: 'Periorbital hyperpigmentation or shadowing',
    vietnameseNormalized: 'Quầng thâm mắt',
  },
  {
    code: 'EYE_BAGS',
    name: 'Eye Bags',
    categoryCode: 'SKIN_CONCERN',
    description: 'Periorbital puffiness from fluid or fat prominence',
    vietnameseNormalized: 'Bọng mắt',
  },
  {
    code: 'UNEVEN_SKIN_TONE',
    name: 'Uneven Skin Tone',
    categoryCode: 'SKIN_CONCERN',
    description: 'Irregular coloration across facial skin areas',
    vietnameseNormalized: 'Tông màu da không đều',
  },
  // SKIN_GOAL
  {
    code: 'ACNE_TREATMENT',
    name: 'Acne Treatment',
    categoryCode: 'SKIN_GOAL',
    description: 'Reduce active breakouts and prevent new lesions',
    vietnameseNormalized: 'Giảm mụn và ngăn ngừa mụn quay lại',
  },
  {
    code: 'BRIGHTENING',
    name: 'Brightening',
    categoryCode: 'SKIN_GOAL',
    description: 'Improve skin luminosity and radiance',
    vietnameseNormalized: 'Dưỡng sáng da rạng rỡ',
  },
  {
    code: 'ANTI_AGING',
    name: 'Anti-aging',
    categoryCode: 'SKIN_GOAL',
    description: 'Address signs of photoaging and collagen decline',
    vietnameseNormalized: 'Ngăn ngừa lão hóa và nếp nhăn',
  },
  {
    code: 'HYDRATION',
    name: 'Hydration',
    categoryCode: 'SKIN_GOAL',
    description: 'Increase skin water content and moisture retention',
    vietnameseNormalized: 'Cấp ẩm sâu và duy trì độ ẩm',
  },
  {
    code: 'OIL_CONTROL',
    name: 'Oil Control',
    categoryCode: 'SKIN_GOAL',
    description: 'Regulate excess sebum production',
    vietnameseNormalized: 'Kiểm soát dầu nhờn, giảm bóng dầu',
  },
  {
    code: 'BARRIER_REPAIR',
    name: 'Barrier Repair',
    categoryCode: 'SKIN_GOAL',
    description: 'Restore and strengthen the skin moisture barrier',
    vietnameseNormalized: 'Phục hồi da yếu và làm dịu kích ứng',
  },
  {
    code: 'REDUCE_PIGMENTATION',
    name: 'Reduce Pigmentation',
    categoryCode: 'SKIN_GOAL',
    description: 'Fade hyperpigmented spots and even discoloration',
    vietnameseNormalized: 'Làm mờ thâm nám và đốm nâu',
  },
  {
    code: 'REDUCE_WRINKLES',
    name: 'Reduce Wrinkles',
    categoryCode: 'SKIN_GOAL',
    description: 'Minimize depth and appearance of wrinkles',
    vietnameseNormalized: 'Cải thiện rãnh nhăn và nếp nhăn',
  },
  {
    code: 'REDUCE_REDNESS',
    name: 'Reduce Redness',
    categoryCode: 'SKIN_GOAL',
    description: 'Calm erythema and decrease visible flushing',
    vietnameseNormalized: 'Làm dịu tình trạng ửng đỏ rát',
  },
  {
    code: 'IMPROVE_SKIN_TEXTURE',
    name: 'Improve Skin Texture',
    categoryCode: 'SKIN_GOAL',
    description: 'Smooth uneven or rough skin surface',
    vietnameseNormalized: 'Cải thiện bề mặt da sần sùi',
  },
  {
    code: 'EVEN_SKIN_TONE',
    name: 'Even Skin Tone',
    categoryCode: 'SKIN_GOAL',
    description: 'Balance overall facial color uniformity',
    vietnameseNormalized: 'Dưỡng da đều màu',
  },
  {
    code: 'MINIMIZE_PORES',
    name: 'Minimize Pores',
    categoryCode: 'SKIN_GOAL',
    description: 'Reduce the visible appearance of pore size',
    vietnameseNormalized: 'Thu nhỏ vẻ ngoài lỗ chân lông',
  },
  // ALLERGY
  {
    code: 'FRAGRANCE',
    name: 'Fragrance',
    categoryCode: 'ALLERGY',
    description: 'Allergy or sensitivity to added fragrance compounds',
    vietnameseNormalized: 'Hương liệu (Fragrance/Parfum)',
  },
  {
    code: 'ALCOHOL',
    name: 'Alcohol',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to denatured alcohol in formulations',
    vietnameseNormalized: 'Cồn khô (Alcohol Denat)',
  },
  {
    code: 'ESSENTIAL_OIL',
    name: 'Essential Oil',
    categoryCode: 'ALLERGY',
    description: 'Reaction to botanical essential oil components',
    vietnameseNormalized: 'Tinh dầu thực vật (Essential Oils)',
  },
  {
    code: 'LANOLIN',
    name: 'Lanolin',
    categoryCode: 'ALLERGY',
    description: 'Allergy to wool-derived lanolin emollients',
    vietnameseNormalized: 'Mỡ cừu (Lanolin)',
  },
  {
    code: 'SALICYLIC_ACID',
    name: 'Salicylic Acid',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to beta hydroxy acid exfoliants',
    vietnameseNormalized: 'Salicylic Acid (BHA)',
  },
  {
    code: 'BENZOYL_PEROXIDE',
    name: 'Benzoyl Peroxide',
    categoryCode: 'ALLERGY',
    description: 'Irritation or allergy to benzoyl peroxide',
    vietnameseNormalized: 'Benzoyl Peroxide',
  },
  {
    code: 'RETINOIDS',
    name: 'Retinoids',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to retinol and retinoid derivatives',
    vietnameseNormalized: 'Retinoids (Retinol/Tretinoin...)',
  },
  {
    code: 'VITAMIN_C',
    name: 'Vitamin C',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to ascorbic acid or its derivatives',
    vietnameseNormalized: 'Vitamin C nguyên chất (L-AA...)',
  },
  {
    code: 'NIACINAMIDE',
    name: 'Niacinamide',
    categoryCode: 'ALLERGY',
    description: 'Sensitivity to vitamin B3 (niacinamide)',
    vietnameseNormalized: 'Niacinamide (Vitamin B3)',
  },
  // CONTRAINDICATION
  {
    code: 'PREGNANCY',
    name: 'Pregnancy',
    categoryCode: 'CONTRAINDICATION',
    description: 'Currently pregnant; restricts certain active ingredients',
    vietnameseNormalized: 'Đang mang thai',
  },
  {
    code: 'BREASTFEEDING',
    name: 'Breastfeeding',
    categoryCode: 'CONTRAINDICATION',
    description: 'Currently breastfeeding; restricts certain actives',
    vietnameseNormalized: 'Đang cho con bú',
  },
  {
    code: 'OPEN_WOUND',
    name: 'Open Wound',
    categoryCode: 'CONTRAINDICATION',
    description: 'Broken or unhealed skin requiring actives to be avoided',
    vietnameseNormalized: 'Da có vết thương hở, vết trầy xước',
  },
  {
    code: 'ACTIVE_SKIN_INFECTION',
    name: 'Active Skin Infection',
    categoryCode: 'CONTRAINDICATION',
    description: 'Bacterial, viral, or fungal infection on treatment area',
    vietnameseNormalized: 'Da đang bị viêm nhiễm hoặc mụn nước',
  },
  {
    code: 'RECENT_CHEMICAL_PEEL',
    name: 'Recent Chemical Peel',
    categoryCode: 'CONTRAINDICATION',
    description: 'Chemical peel within the recovery window',
    vietnameseNormalized: 'Vừa lột da sinh học (Peel da mạnh)',
  },
  {
    code: 'RECENT_LASER_TREATMENT',
    name: 'Recent Laser Treatment',
    categoryCode: 'CONTRAINDICATION',
    description: 'Laser procedure within the required healing period',
    vietnameseNormalized: 'Vừa điều trị Laser/Lăn kim',
  },
  {
    code: 'RECENT_MICRONEEDLING',
    name: 'Recent Microneedling',
    categoryCode: 'CONTRAINDICATION',
    description: 'Microneedling within the post-procedure recovery window',
    vietnameseNormalized: 'Vừa phi kim hoặc lăn kim',
  },
  // AGE_GROUP
  {
    code: 'UNDER_18',
    name: 'Under 18',
    categoryCode: 'AGE_GROUP',
    description: 'Customer is younger than 18 years old',
    vietnameseNormalized: 'Dưới 18 tuổi',
  },
  {
    code: 'AGE_18_25',
    name: '18–25',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 18 to 25 years',
    vietnameseNormalized: 'Từ 18 đến 25 tuổi',
  },
  {
    code: 'AGE_26_35',
    name: '26–35',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 26 to 35 years',
    vietnameseNormalized: 'Từ 26 đến 35 tuổi',
  },
  {
    code: 'AGE_36_45',
    name: '36–45',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 36 to 45 years',
    vietnameseNormalized: 'Từ 36 đến 45 tuổi',
  },
  {
    code: 'AGE_46_60',
    name: '46–60',
    categoryCode: 'AGE_GROUP',
    description: 'Customer age range 46 to 60 years',
    vietnameseNormalized: 'Từ 46 đến 60 tuổi',
  },
  {
    code: 'ABOVE_60',
    name: 'Above 60',
    categoryCode: 'AGE_GROUP',
    description: 'Customer is older than 60 years',
    vietnameseNormalized: 'Trên 60 tuổi',
  },
  // GENDER
  {
    code: 'MALE',
    name: 'Male',
    categoryCode: 'GENDER',
    description: 'Male gender',
    vietnameseNormalized: 'Nam',
  },
  {
    code: 'FEMALE',
    name: 'Female',
    categoryCode: 'GENDER',
    description: 'Female gender',
    vietnameseNormalized: 'Nữ',
  },
  {
    code: 'NOT_PREFER_TO_SAY',
    name: 'Prefer not to say',
    categoryCode: 'GENDER',
    description: 'Customer prefers not to disclose gender',
    vietnameseNormalized: 'Không muốn tiết lộ',
  },
  // LIFESTYLE
  {
    code: 'OUTDOOR_LIFESTYLE',
    name: 'Outdoor Lifestyle',
    categoryCode: 'LIFESTYLE',
    description: 'Frequent outdoor daily activities and sun exposure',
    vietnameseNormalized: 'Thường xuyên hoạt động ngoài trời',
  },
  {
    code: 'INDOOR_LIFESTYLE',
    name: 'Indoor Lifestyle',
    categoryCode: 'LIFESTYLE',
    description: 'Primarily indoor daily routine with limited sun exposure',
    vietnameseNormalized: 'Chủ yếu làm việc trong nhà/văn phòng',
  },
  {
    code: 'NIGHT_SHIFT',
    name: 'Night Shift',
    categoryCode: 'LIFESTYLE',
    description: 'Regular overnight work disrupting circadian skin rhythm',
    vietnameseNormalized: 'Thức khuya hoặc làm ca đêm',
  },
  {
    code: 'HIGH_SUN_EXPOSURE',
    name: 'High Sun Exposure',
    categoryCode: 'LIFESTYLE',
    description: 'Prolonged unprotected ultraviolet exposure',
    vietnameseNormalized: 'Tiếp xúc nhiều với ánh nắng trực tiếp',
  },
  {
    code: 'HEAVY_MAKEUP',
    name: 'Heavy Makeup',
    categoryCode: 'LIFESTYLE',
    description: 'Daily full-coverage or long-wear cosmetic use',
    vietnameseNormalized: 'Trang điểm đậm, dùng kem nền hàng ngày',
  },
  {
    code: 'FREQUENT_EXERCISE',
    name: 'Frequent Exercise',
    categoryCode: 'LIFESTYLE',
    description: 'Regular physical activity with sweat and friction',
    vietnameseNormalized: 'Tập thể thao thường xuyên ra nhiều mồ hôi',
  },
  {
    code: 'AIR_CONDITIONED_ENVIRONMENT',
    name: 'Air-conditioned Environment',
    categoryCode: 'LIFESTYLE',
    description: 'Prolonged exposure to dry, climate-controlled air',
    vietnameseNormalized: 'Ngồi điều hòa/máy lạnh liên tục',
  },
  {
    code: 'SMOKING',
    name: 'Smoking',
    categoryCode: 'LIFESTYLE',
    description: 'Tobacco use affecting skin oxidative stress',
    vietnameseNormalized: 'Có hút thuốc lá hoặc tiếp xúc khói thuốc',
  },
  {
    code: 'HIGH_STRESS',
    name: 'High Stress',
    categoryCode: 'LIFESTYLE',
    description: 'Elevated chronic stress impacting skin inflammation',
    vietnameseNormalized: 'Thường xuyên căng thẳng, áp lực cao',
  },
  // EXPERIENCE_LEVEL
  {
    code: 'BEGINNER',
    name: 'Beginner',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'New to active ingredients and multi-step routines',
    vietnameseNormalized: 'Người mới bắt đầu (Chưa dùng active bao giờ)',
  },
  {
    code: 'INTERMEDIATE',
    name: 'Intermediate',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'Comfortable with common actives at moderate strength',
    vietnameseNormalized: 'Đã có kinh nghiệm cơ bản',
  },
  {
    code: 'ADVANCED',
    name: 'Advanced',
    categoryCode: 'EXPERIENCE_LEVEL',
    description: 'Experienced with potent actives and layered routines',
    vietnameseNormalized: 'Đã rất quen thuộc và thành thạo',
  },
  // PRODUCT_PREFERENCE
  {
    code: 'FRAGRANCE_FREE',
    name: 'Fragrance Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without added fragrance',
    vietnameseNormalized: 'Không chứa hương liệu',
  },
  {
    code: 'ALCOHOL_FREE',
    name: 'Alcohol Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers formulations without denatured alcohol',
    vietnameseNormalized: 'Không chứa cồn khô',
  },
  {
    code: 'ESSENTIAL_OIL_FREE',
    name: 'Essential Oil Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without essential oils',
    vietnameseNormalized: 'Không chứa tinh dầu',
  },
  {
    code: 'NON_COMEDOGENIC',
    name: 'Non-Comedogenic',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products unlikely to clog pores',
    vietnameseNormalized: 'Không gây bít tắc lỗ chân lông',
  },
  {
    code: 'HYPOALLERGENIC',
    name: 'Hypoallergenic',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers low-allergen formulated products',
    vietnameseNormalized: 'Công thức ít gây kích ứng',
  },
  {
    code: 'DERMATOLOGIST_TESTED',
    name: 'Dermatologist Tested',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers clinically or dermatologist-evaluated products',
    vietnameseNormalized: 'Được kiểm nghiệm bởi bác sĩ da liễu',
  },
  {
    code: 'VEGAN',
    name: 'Vegan',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products without animal-derived ingredients',
    vietnameseNormalized: 'Thuần chay (Vegan)',
  },
  {
    code: 'CRUELTY_FREE',
    name: 'Cruelty Free',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Prefers products not tested on animals',
    vietnameseNormalized: 'Không thử nghiệm trên động vật (Cruelty-Free)',
  },
  // LIFESTYLE — environment extensions
  {
    code: 'HOT_HUMID',
    name: 'Hot Humid Climate',
    categoryCode: 'LIFESTYLE',
    description: 'Lives or spends time in hot, humid conditions',
    vietnameseNormalized: 'Sống/tiếp xúc khí hậu nóng ẩm',
  },
  {
    code: 'DRY_COLD',
    name: 'Dry Cold Climate',
    categoryCode: 'LIFESTYLE',
    description: 'Lives or spends time in dry or cold conditions',
    vietnameseNormalized: 'Sống/tiếp xúc khí hậu khô lạnh',
  },
  {
    code: 'URBAN_POLLUTION',
    name: 'Urban Pollution',
    categoryCode: 'LIFESTYLE',
    description: 'Frequent exposure to urban dust and pollution',
    vietnameseNormalized: 'Thường xuyên tiếp xúc khói bụi/ô nhiễm',
  },
  {
    code: 'FREQUENT_MASK',
    name: 'Frequent Mask Wear',
    categoryCode: 'LIFESTYLE',
    description: 'Wears a face mask for many hours most days',
    vietnameseNormalized: 'Thường đeo khẩu trang nhiều giờ',
  },
  {
    code: 'POOR_SLEEP',
    name: 'Poor Sleep',
    categoryCode: 'LIFESTYLE',
    description: 'Often sleeps insufficiently or irregularly',
    vietnameseNormalized: 'Thường ngủ thiếu hoặc thất thường',
  },
  // SKIN_TYPE_SIGNAL
  {
    code: 'OILY_TENDENCY',
    name: 'Oily Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin feels oily or shiny soon after cleansing',
    vietnameseNormalized: 'Xu hướng da dầu/bóng dầu',
  },
  {
    code: 'DRY_TENDENCY',
    name: 'Dry Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin feels tight, flaky, or dry without moisturizer',
    vietnameseNormalized: 'Xu hướng da khô/căng',
  },
  {
    code: 'COMBINATION_TENDENCY',
    name: 'Combination Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Oily T-zone with drier cheeks',
    vietnameseNormalized: 'Da hỗn hợp (dầu chữ T, khô má)',
  },
  {
    code: 'SENSITIVE_TENDENCY',
    name: 'Sensitive Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin often stings, burns, or flushes with product changes',
    vietnameseNormalized: 'Xu hướng da nhạy cảm',
  },
  {
    code: 'RESISTANT_TENDENCY',
    name: 'Resistant Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin usually tolerates new products well',
    vietnameseNormalized: 'Da khỏe, ít kích ứng',
  },
  {
    code: 'PIGMENTED_TENDENCY',
    name: 'Pigmented Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin easily leaves dark marks or tans unevenly',
    vietnameseNormalized: 'Xu hướng dễ thâm/sạm',
  },
  {
    code: 'NON_PIGMENTED_TENDENCY',
    name: 'Non-pigmented Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Dark marks fade quickly; tone stays relatively even',
    vietnameseNormalized: 'Ít thâm sạm, da đều màu',
  },
  {
    code: 'WRINKLED_TENDENCY',
    name: 'Wrinkled Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Visible fine lines or reduced firmness',
    vietnameseNormalized: 'Xu hướng nếp nhăn/kém săn chắc',
  },
  {
    code: 'TIGHT_TENDENCY',
    name: 'Tight Tendency',
    categoryCode: 'SKIN_TYPE_SIGNAL',
    description: 'Skin still looks firm with few visible wrinkles',
    vietnameseNormalized: 'Da căng mịn, ít nếp nhăn',
  },
  // ROUTINE
  {
    code: 'HAS_SKINCARE_ROUTINE',
    name: 'Has Skincare Routine',
    categoryCode: 'ROUTINE',
    description: 'Currently follows a regular skincare routine',
    vietnameseNormalized: 'Đang có routine chăm sóc da',
  },
  {
    code: 'NO_SKINCARE_ROUTINE',
    name: 'No Skincare Routine',
    categoryCode: 'ROUTINE',
    description: 'Does not currently follow a regular routine',
    vietnameseNormalized: 'Chưa có routine cố định',
  },
  {
    code: 'SUNSCREEN_DAILY',
    name: 'Daily Sunscreen',
    categoryCode: 'ROUTINE',
    description: 'Applies sunscreen every day',
    vietnameseNormalized: 'Dùng kem chống nắng mỗi ngày',
  },
  {
    code: 'SUNSCREEN_SOMETIMES',
    name: 'Occasional Sunscreen',
    categoryCode: 'ROUTINE',
    description: 'Uses sunscreen only on some days or outdoors',
    vietnameseNormalized: 'Chống nắng không đều',
  },
  {
    code: 'SUNSCREEN_RARELY',
    name: 'Rare Sunscreen',
    categoryCode: 'ROUTINE',
    description: 'Rarely or never uses sunscreen',
    vietnameseNormalized: 'Hiếm khi dùng kem chống nắng',
  },
  {
    code: 'SUNSCREEN_BREAKOUTS',
    name: 'Sunscreen Breakouts',
    categoryCode: 'ROUTINE',
    description: 'Sunscreen often feels heavy or causes breakouts',
    vietnameseNormalized: 'Kem chống nắng dễ bí da/nổi mụn',
  },
  {
    code: 'OFTEN_SKIPS_ROUTINE',
    name: 'Often Skips Routine',
    categoryCode: 'ROUTINE',
    description: 'Frequently skips routine steps when busy',
    vietnameseNormalized: 'Hay bỏ routine khi bận',
  },
  {
    code: 'CLEANSING_THOROUGH',
    name: 'Thorough Cleansing',
    categoryCode: 'ROUTINE',
    description: 'Removes makeup/sunscreen carefully at end of day',
    vietnameseNormalized: 'Tẩy trang/làm sạch kỹ cuối ngày',
  },
  {
    code: 'CLEANSING_BASIC',
    name: 'Basic Cleansing',
    categoryCode: 'ROUTINE',
    description: 'Uses only a simple face wash without thorough removal',
    vietnameseNormalized: 'Chỉ rửa mặt đơn giản',
  },
  // ACTIVE_USAGE
  {
    code: 'USING_AHA',
    name: 'Using AHA',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses alpha hydroxy acids',
    vietnameseNormalized: 'Đang dùng AHA',
  },
  {
    code: 'USING_BHA',
    name: 'Using BHA',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses beta hydroxy acids',
    vietnameseNormalized: 'Đang dùng BHA',
  },
  {
    code: 'USING_RETINOID',
    name: 'Using Retinoid',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses retinol or prescription retinoids',
    vietnameseNormalized: 'Đang dùng retinoid/retinol',
  },
  {
    code: 'USING_BENZOYL_PEROXIDE',
    name: 'Using Benzoyl Peroxide',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses benzoyl peroxide',
    vietnameseNormalized: 'Đang dùng benzoyl peroxide',
  },
  {
    code: 'USING_VITAMIN_C',
    name: 'Using Vitamin C',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses vitamin C treatments',
    vietnameseNormalized: 'Đang dùng vitamin C',
  },
  {
    code: 'USING_NIACINAMIDE',
    name: 'Using Niacinamide',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Currently uses niacinamide',
    vietnameseNormalized: 'Đang dùng niacinamide',
  },
  {
    code: 'NO_ACTIVES',
    name: 'No Actives',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Not currently using common active treatments',
    vietnameseNormalized: 'Không dùng hoạt chất đặc trị',
  },
  {
    code: 'ACTIVE_IRRITATION',
    name: 'Active Irritation',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Actives cause dryness, sting, peel, or extra breakouts',
    vietnameseNormalized: 'Treatment gây khô/rát/bong/nổi mụn',
  },
  {
    code: 'STACKS_ACTIVES',
    name: 'Stacks Actives',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Uses multiple actives in the same routine session',
    vietnameseNormalized: 'Dùng nhiều treatment cùng lúc',
  },
  {
    code: 'ACTIVE_FREQ_LOW',
    name: 'Low Active Frequency',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Uses treatment actives 1–2 times per week',
    vietnameseNormalized: 'Dùng treatment 1–2 lần/tuần',
  },
  {
    code: 'ACTIVE_FREQ_MODERATE',
    name: 'Moderate Active Frequency',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Uses treatment actives 3–4 times per week',
    vietnameseNormalized: 'Dùng treatment 3–4 lần/tuần',
  },
  {
    code: 'ACTIVE_FREQ_HIGH',
    name: 'High Active Frequency',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Uses treatment actives most days or daily',
    vietnameseNormalized: 'Dùng treatment hầu như mỗi ngày',
  },
  // PERSONALITY
  {
    code: 'PREFER_MINIMALIST',
    name: 'Prefer Minimalist Routine',
    categoryCode: 'PERSONALITY',
    description: 'Prefers few steps that are easy to maintain',
    vietnameseNormalized: 'Thích routine tối giản',
  },
  {
    code: 'PREFER_ADVANCED_ROUTINE',
    name: 'Prefer Advanced Routine',
    categoryCode: 'PERSONALITY',
    description: 'Comfortable with multi-step or treatment-heavy routines',
    vietnameseNormalized: 'Thích routine chuyên sâu nhiều bước',
  },
  {
    code: 'SAFETY_FIRST',
    name: 'Safety First',
    categoryCode: 'PERSONALITY',
    description: 'Prioritizes low irritation over fast results',
    vietnameseNormalized: 'Ưu tiên ít kích ứng hơn hiệu quả nhanh',
  },
  {
    code: 'QUICK_RESULTS',
    name: 'Quick Results',
    categoryCode: 'PERSONALITY',
    description: 'Wants faster visible improvement and accepts stronger care',
    vietnameseNormalized: 'Muốn hiệu quả nhanh',
  },
  {
    code: 'BUDGET_CONSCIOUS',
    name: 'Budget Conscious',
    categoryCode: 'PERSONALITY',
    description: 'Prefers affordable, easy-to-repurchase products',
    vietnameseNormalized: 'Ưu tiên routine tiết kiệm',
  },
  {
    code: 'BUDGET_BALANCED',
    name: 'Balanced Budget',
    categoryCode: 'PERSONALITY',
    description: 'Comfortable with mid-range spend for results',
    vietnameseNormalized: 'Ngân sách cân bằng',
  },
  {
    code: 'PREMIUM_ORIENTED',
    name: 'Premium Oriented',
    categoryCode: 'PERSONALITY',
    description: 'Willing to spend more for experience and results',
    vietnameseNormalized: 'Sẵn sàng chi cao cấp hơn',
  },
  {
    code: 'TEXTURE_LIGHT',
    name: 'Light Texture Preference',
    categoryCode: 'PERSONALITY',
    description: 'Prefers lightweight, fast-absorbing textures',
    vietnameseNormalized: 'Thích texture mỏng nhẹ, thấm nhanh',
  },
  {
    code: 'TEXTURE_RICH',
    name: 'Rich Texture Preference',
    categoryCode: 'PERSONALITY',
    description: 'Prefers richer, longer-lasting moisture',
    vietnameseNormalized: 'Thích texture dưỡng ẩm sâu',
  },
  {
    code: 'FINISH_MATTE',
    name: 'Matte Finish',
    categoryCode: 'PERSONALITY',
    description: 'Prefers a dry/matte skin finish',
    vietnameseNormalized: 'Thích finish ráo mặt',
  },
  {
    code: 'FINISH_DEWY',
    name: 'Dewy Finish',
    categoryCode: 'PERSONALITY',
    description: 'Prefers a moist, dewy finish',
    vietnameseNormalized: 'Thích finish ẩm mượt',
  },
  {
    code: 'FINISH_GLOWY',
    name: 'Glowy Finish',
    categoryCode: 'PERSONALITY',
    description: 'Prefers a glowy finish',
    vietnameseNormalized: 'Thích finish glowy',
  },
  {
    code: 'OPEN_TO_NEW_ACTIVES',
    name: 'Open to New Actives',
    categoryCode: 'PERSONALITY',
    description: 'Willing to try new active ingredients',
    vietnameseNormalized: 'Sẵn sàng thử hoạt chất mới',
  },
  {
    code: 'STICK_TO_FAMILIAR',
    name: 'Stick to Familiar',
    categoryCode: 'PERSONALITY',
    description: 'Prefers familiar products over experimenting',
    vietnameseNormalized: 'Thích sản phẩm quen thuộc',
  },
  {
    code: 'FOCUS_ONE_CONCERN',
    name: 'Focus One Concern',
    categoryCode: 'PERSONALITY',
    description: 'Wants to prioritize one main skin problem',
    vietnameseNormalized: 'Tập trung một vấn đề chính',
  },
  {
    code: 'FOCUS_OVERALL',
    name: 'Focus Overall Skin',
    categoryCode: 'PERSONALITY',
    description: 'Wants overall skin improvement, not one issue only',
    vietnameseNormalized: 'Cải thiện da tổng thể',
  },
  // SAFETY_CONTEXT
  {
    code: 'COSMETIC_REACTION_HISTORY',
    name: 'Cosmetic Reaction History',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Has had strong reactions to cosmetic ingredients',
    vietnameseNormalized: 'Từng phản ứng mạnh với mỹ phẩm',
  },
  {
    code: 'NO_COSMETIC_REACTION',
    name: 'No Cosmetic Reaction',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'No known strong cosmetic reactions',
    vietnameseNormalized: 'Không từng phản ứng mạnh với mỹ phẩm',
  },
  {
    code: 'UNDER_DERM_CARE',
    name: 'Under Dermatologist Care',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Currently treated by a dermatologist',
    vietnameseNormalized: 'Đang được bác sĩ da liễu điều trị',
  },
  {
    code: 'NOT_UNDER_DERM_CARE',
    name: 'Not Under Dermatologist Care',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Not currently under dermatologist treatment',
    vietnameseNormalized: 'Không đang điều trị với bác sĩ da liễu',
  },
  {
    code: 'PRESCRIPTION_SKIN_MEDS',
    name: 'Prescription Skin Meds',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Uses prescription topical or oral skin medication',
    vietnameseNormalized: 'Đang dùng thuốc bôi/uống theo toa cho da',
  },
  {
    code: 'PREFER_NOT_ANSWER_PREGNANCY',
    name: 'Prefer Not Answer Pregnancy',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Prefers not to disclose pregnancy or breastfeeding status',
    vietnameseNormalized: 'Không muốn trả lời tình trạng mang thai/cho con bú',
  },
  {
    code: 'NOT_PREGNANT_OR_BREASTFEEDING',
    name: 'Not Pregnant or Breastfeeding',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Not currently pregnant or breastfeeding',
    vietnameseNormalized: 'Không mang thai hoặc cho con bú',
  },
  {
    code: 'NO_OPEN_WOUND',
    name: 'No Open Wound',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'No open wounds, severe swelling, or active infection signs',
    vietnameseNormalized: 'Không có vết thương hở hay nhiễm trùng',
  },
  {
    code: 'DOES_NOT_STACK_ACTIVES',
    name: 'Does Not Stack Actives',
    categoryCode: 'ACTIVE_USAGE',
    description: 'Does not layer multiple treatments in one session',
    vietnameseNormalized: 'Không dùng nhiều treatment cùng lúc',
  },
  {
    code: 'NO_FRAGRANCE_PREFERENCE',
    name: 'No Fragrance Preference',
    categoryCode: 'PERSONALITY',
    description: 'Fragrance in products is not important',
    vietnameseNormalized: 'Hương liệu không quan trọng',
  },
  {
    code: 'ACNE_INFLAMED',
    name: 'Inflamed Acne',
    categoryCode: 'SKIN_CONCERN',
    description: 'Painful, swollen, or deep under-the-skin acne',
    vietnameseNormalized: 'Mụn đau, sưng hoặc nằm sâu',
  },
  {
    code: 'ACNE_MILD_SURFACE',
    name: 'Mild Surface Acne',
    categoryCode: 'SKIN_CONCERN',
    description: 'Mostly surface blackheads/whiteheads without deep pain',
    vietnameseNormalized: 'Mụn nông, ít đau sưng',
  },
  {
    code: 'HORMONAL_CHANGES',
    name: 'Hormonal Changes',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Currently experiencing hormonal change affecting skin',
    vietnameseNormalized: 'Đang trong giai đoạn thay đổi nội tiết',
  },
  {
    code: 'NO_HORMONAL_CHANGES',
    name: 'No Hormonal Changes',
    categoryCode: 'SAFETY_CONTEXT',
    description: 'Not currently in a hormonal-change stage',
    vietnameseNormalized: 'Không trong giai đoạn thay đổi nội tiết',
  },
  // PERSONALITY — full GlowScan personality types (§8.1)
  {
    code: 'PERSONALITY_MINIMALIST',
    name: 'Minimalist',
    categoryCode: 'PERSONALITY',
    description: 'Prefers few steps that are fast and easy to maintain',
    vietnameseNormalized: 'Minimalist — routine ít bước',
  },
  {
    code: 'PERSONALITY_TREATMENT_FOCUSED',
    name: 'Treatment-focused',
    categoryCode: 'PERSONALITY',
    description: 'Accepts stronger treatments to see results',
    vietnameseNormalized: 'Treatment-focused — chấp nhận treatment mạnh',
  },
  {
    code: 'PERSONALITY_SENSITIVE_CARE',
    name: 'Sensitive-care',
    categoryCode: 'PERSONALITY',
    description: 'Prioritizes gentle, barrier-repair, low-irritation care',
    vietnameseNormalized: 'Sensitive-care — ưu tiên dịu nhẹ phục hồi',
  },
  {
    code: 'PERSONALITY_BEAUTY_EXPLORER',
    name: 'Beauty-explorer',
    categoryCode: 'PERSONALITY',
    description: 'Likes trying new products and ingredients',
    vietnameseNormalized: 'Beauty-explorer — thích thử sản phẩm mới',
  },
  {
    code: 'PERSONALITY_BUDGET_CONSCIOUS',
    name: 'Budget-conscious',
    categoryCode: 'PERSONALITY',
    description: 'Cares about price and easy repurchase',
    vietnameseNormalized: 'Budget-conscious — quan tâm giá',
  },
  {
    code: 'PERSONALITY_CONSISTENCY_FOCUSED',
    name: 'Consistency-focused',
    categoryCode: 'PERSONALITY',
    description: 'Wants a stable routine that is easy to follow',
    vietnameseNormalized: 'Consistency-focused — muốn routine ổn định',
  },
  {
    code: 'PERSONALITY_QUICK_RESULT',
    name: 'Quick-result seeker',
    categoryCode: 'PERSONALITY',
    description: 'Wants faster visible improvement',
    vietnameseNormalized: 'Quick-result — muốn cải thiện nhanh',
  },
  {
    code: 'PERSONALITY_SAFETY_FIRST',
    name: 'Safety-first',
    categoryCode: 'PERSONALITY',
    description: 'Prioritizes safety over fast results',
    vietnameseNormalized: 'Safety-first — ưu tiên an toàn',
  },
  {
    code: 'PERSONALITY_PREMIUM',
    name: 'Premium-oriented',
    categoryCode: 'PERSONALITY',
    description: 'Willing to spend more for experience and results',
    vietnameseNormalized: 'Premium-oriented — sẵn sàng chi cao cấp',
  },
  {
    code: 'PERSONALITY_EVIDENCE_DRIVEN',
    name: 'Evidence-driven',
    categoryCode: 'PERSONALITY',
    description: 'Wants clear reasons and ingredient explanations',
    vietnameseNormalized: 'Evidence-driven — muốn hiểu lý do đề xuất',
  },
  {
    code: 'PERSONALITY_LOW_MAINTENANCE',
    name: 'Low-maintenance',
    categoryCode: 'PERSONALITY',
    description: 'Drops routine if it becomes too complex',
    vietnameseNormalized: 'Low-maintenance — dễ bỏ nếu quá phức tạp',
  },
  {
    code: 'PERSONALITY_PROBLEM_SOLVER',
    name: 'Problem-solver',
    categoryCode: 'PERSONALITY',
    description: 'Wants to focus on the main concern only',
    vietnameseNormalized: 'Problem-solver — xử lý concern chính',
  },
];

const SKIN_TYPES = [
  {
    code: 'OSPW',
    name: 'Da dầu, dễ kích ứng, có vết thâm sạm và bắt đầu xuất hiện nếp nhăn',
    description:
      'Làn da thường xuyên tiết nhiều dầu, nhạy cảm dễ ửng đỏ khi gặp kích ứng, có vết thâm hoặc sạm nám sau mụn và bắt đầu có dấu hiệu lão hóa.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'OSPT',
    name: 'Da dầu, dễ kích ứng, dễ thâm sau mụn nhưng độ đàn hồi tốt',
    description:
      'Làn da thường tiết nhiều dầu, nhạy cảm dễ mẩn đỏ, dễ để lại vết thâm sau mụn nhưng cấu trúc da vẫn săn chắc và ít nếp nhăn.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'OSNW',
    name: 'Da dầu, dễ kích ứng, ít thâm sạm nhưng bắt đầu có nếp nhăn',
    description:
      'Làn da thường xuyên bóng dầu, nhạy cảm với mỹ phẩm hoặc môi trường, không bị sạm nám nhiều nhưng bắt đầu xuất hiện nếp nhăn.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'OSNT',
    name: 'Da dầu, dễ kích ứng, đều màu và độ đàn hồi tốt',
    description:
      'Làn da tiết nhiều dầu, nhạy cảm dễ rát nhẹ khi dùng sản phẩm lạ, nhưng tông da đều màu và cấu trúc da vẫn rất căng mịn.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'ORPW',
    name: 'Da dầu, khỏe mạnh, có vết thâm sạm và có nếp nhăn',
    description:
      'Làn da tiết dầu thường xuyên, sức đề kháng da tốt ít khi bị kích ứng, tuy nhiên có các vết thâm nám và nếp nhăn xuất hiện.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'ORPT',
    name: 'Da dầu, khỏe mạnh, dễ thâm sau mụn và độ đàn hồi tốt',
    description:
      'Làn da hay bóng dầu, khỏe mạnh không dễ kích ứng, dễ có vết thâm sạm sau khi lên mụn nhưng độ đàn hồi và độ căng săn chắc rất tốt.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'ORNW',
    name: 'Da dầu, khỏe mạnh, đều màu nhưng bắt đầu có nếp nhăn',
    description:
      'Làn da hay đổ dầu, ít nhạy cảm và đều màu, tuy nhiên đang có các dấu hiệu lão hóa như nếp nhăn ở vùng mắt hoặc trán.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'ORNT',
    name: 'Da dầu, khỏe mạnh, đều màu và độ đàn hồi căng mịn',
    description:
      'Làn da bóng dầu nhưng rất khỏe, không bị kích ứng hay sạm nám, cấu trúc da săn chắc đàn hồi tốt và ít nếp nhăn.',
    oilyDry: OilyDry.OILY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DSPW',
    name: 'Da khô, dễ kích ứng, có vết thâm sạm và có nếp nhăn',
    description:
      'Làn da thường có cảm giác khô căng, nhạy cảm dễ ửng đỏ rát nhẹ, dễ bị thâm sạm nám và có nhiều nếp nhăn do thiếu ẩm.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DSPT',
    name: 'Da khô, dễ kích ứng, dễ thâm sạm nhưng độ đàn hồi tốt',
    description:
      'Làn da hơi khô ráp, nhạy cảm với các yếu tố kích thích bên ngoài, dễ có thâm sạm nhưng bề mặt da vẫn giữ được độ săn chắc.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DSNW',
    name: 'Da khô, dễ kích ứng, đều màu nhưng bắt đầu xuất hiện nếp nhăn',
    description:
      'Làn da khô thiếu độ ẩm, nhạy cảm dễ châm chích, tông da khá đều màu nhưng dễ hình thành nếp nhăn chùng nhão.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DSNT',
    name: 'Da khô, dễ kích ứng, đều màu và độ đàn hồi căng tốt',
    description:
      'Làn da thường có xu hướng khô, nhạy cảm nhẹ, không bị vết thâm sạm hay sạm màu và độ đàn hồi của da vẫn còn tốt.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.SENSITIVE,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DRPW',
    name: 'Da khô, khỏe mạnh, có vết thâm sạm và có nếp nhăn',
    description:
      'Làn da khô ít khi bị mẩn cảm kích ứng, tuy nhiên có xuất hiện các đốm thâm nám sạm và nếp nhăn lão hóa.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DRPT',
    name: 'Da khô, khỏe mạnh, dễ thâm sạm nhưng cấu trúc săn chắc',
    description:
      'Làn da khô ráo và khỏe mạnh ít nhạy cảm, dễ có một vài vết thâm sạm nhưng độ đàn hồi da vẫn rất tốt, ít nếp nhăn.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.PIGMENTED,
    wrinkledTight: WrinkledTight.TIGHT,
  },
  {
    code: 'DRNW',
    name: 'Da khô, khỏe mạnh, đều màu nhưng có nếp nhăn lão hóa',
    description:
      'Làn da khô ít kích ứng, bề mặt da sáng đều màu nhưng cần bổ sung dưỡng ẩm do bắt đầu có nếp nhăn và rãnh nhăn.',
    oilyDry: OilyDry.DRY,
    sensitiveResistant: SensitiveResistant.RESISTANT,
    pigmentedNonPigmented: PigmentedNonPigmented.NON_PIGMENTED,
    wrinkledTight: WrinkledTight.WRINKLED,
  },
  {
    code: 'DRNT',
    name: 'Da khô, khỏe mạnh, sáng đều màu và săn chắc căng mịn',
    description:
      'Làn da khô lý tưởng, khỏe mạnh không kích ứng, tông màu da sáng đều mịn màng và độ đàn hồi rất tốt.',
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
  {
    name: 'The Ordinary Retinol 0.3% in Squalane',
    brandName: 'The Ordinary',
    categoryCode: 'TREATMENT',
    description: 'Retinol treatment serum for fine lines and anti-aging',
    sku: 'TO-RETINOL-0.3-30ML',
    volume: '30ml',
    packaging: 'Dropper bottle',
    priceVnd: 220000,
    ingredients: [
      {
        ingredientName: 'Retinol',
        concentrationPct: 0.3,
        isKeyIngredient: true,
      },
    ],
  },
  {
    name: 'La Roche-Posay Toleriane Sensitive Fluid',
    brandName: 'La Roche-Posay',
    categoryCode: 'MOISTURIZER',
    description:
      'Fragrance-free calming moisturizer for redness-prone sensitive skin',
    sku: 'LRP-TOLERIANE-SENSITIVE-40ML',
    volume: '40ml',
    packaging: 'Tube',
    priceVnd: 390000,
    ingredients: [
      { ingredientName: 'Ceramide', isKeyIngredient: true },
      { ingredientName: 'Niacinamide', concentrationPct: 2 },
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

/**
 * Maps product SKU → protocol codes.
 * Put the category/step-role protocol first so routine generation gets
 * cleanser/toner/sunscreen-style instructions instead of only ingredient actives.
 */
const PRODUCT_PROTOCOL_MAPPINGS: Array<{
  sku: string;
  protocolCode: string;
}> = [
  // Cleanser → step protocol + barrier/niacinamide actives
  { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'cleanser_gentle_foam' },
  { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'ceramide_barrier' },
  { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'niacinamide_general' },
  // Toner → exfoliating step + AHA/BHA
  { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'toner_exfoliating' },
  { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'glycolic_exfoliation' },
  { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'salicylic_acne' },
  // Serum
  { sku: 'TO-NIACINAMIDE-10-ZINC-30ML', protocolCode: 'serum_niacinamide' },
  { sku: 'TO-NIACINAMIDE-10-ZINC-30ML', protocolCode: 'niacinamide_general' },
  // Moisturizer
  { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'moisturizer_barrier' },
  { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ceramide_barrier' },
  { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ha_hydration' },
  // Sunscreen (was wrongly only ha_hydration)
  { sku: 'LRP-ANTHELIOS-UVMUNE-50ML', protocolCode: 'sunscreen_daily_spf' },
  { sku: 'LRP-ANTHELIOS-UVMUNE-50ML', protocolCode: 'ha_hydration' },
  // Acne treatment
  { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'treatment_acne_spot' },
  { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'benzoyl_acne' },
  { sku: 'LRP-EFFAC-DUO-40ML', protocolCode: 'azelaic_pigmentation' },
  // Retinol anti-aging
  { sku: 'TO-RETINOL-0.3-30ML', protocolCode: 'retinol_0.3_anti_aging' },
  // Calming / redness-prone moisturizer
  {
    sku: 'LRP-TOLERIANE-SENSITIVE-40ML',
    protocolCode: 'moisturizer_barrier',
  },
  { sku: 'LRP-TOLERIANE-SENSITIVE-40ML', protocolCode: 'ceramide_barrier' },
  { sku: 'LRP-TOLERIANE-SENSITIVE-40ML', protocolCode: 'niacinamide_general' },
];

const SURVEY_QUESTIONS: Array<{
  code: string;
  text: string;
  questionType: string;
  displayOrder: number;
  priority: QuestionPriority;
  category: string;
  intent: string;
  askWhen: QuestionAskWhen | null;
  optionCodes: string[];
}> = [
  // ── L1 Core ──────────────────────────────────────────────────────────────
  {
    code: 'PRIMARY_CONCERN',
    text: 'Vấn đề da nào làm bạn khó chịu nhất hiện tại?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 1,
    priority: QuestionPriority.CORE,
    category: 'SKIN_CONCERN',
    intent: 'Identify the customer primary visible skin concern',
    askWhen: { always: true },
    optionCodes: [
      'ACNE',
      'HYPERPIGMENTATION',
      'REDNESS',
      'DEHYDRATED_SKIN',
      'WRINKLES',
      'DULL_SKIN',
      'ENLARGED_PORES',
      'ROUGH_TEXTURE',
    ],
  },
  {
    code: 'SKIN_GOALS',
    text: 'Ngoài vấn đề chính, bạn còn muốn cải thiện điều gì?',
    questionType: 'MULTI_SELECT',
    displayOrder: 2,
    priority: QuestionPriority.CORE,
    category: 'SKIN_GOAL',
    intent: 'Capture secondary skincare goals',
    askWhen: { always: true },
    optionCodes: [
      'ACNE_TREATMENT',
      'BRIGHTENING',
      'ANTI_AGING',
      'HYDRATION',
      'OIL_CONTROL',
      'BARRIER_REPAIR',
      'REDUCE_PIGMENTATION',
      'REDUCE_WRINKLES',
      'REDUCE_REDNESS',
      'IMPROVE_SKIN_TEXTURE',
      'EVEN_SKIN_TONE',
      'MINIMIZE_PORES',
    ],
  },
  {
    code: 'POST_CLEANSE_FEEL',
    text: 'Sau khi rửa mặt 15–30 phút, da bạn thường cảm thấy thế nào?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 3,
    priority: QuestionPriority.CORE,
    category: 'SKIN_TYPE',
    intent: 'Baumann O/D — post-cleanse oil vs dryness signal',
    askWhen: { always: true },
    optionCodes: ['OILY_TENDENCY', 'DRY_TENDENCY', 'COMBINATION_TENDENCY'],
  },
  {
    code: 'TZONE_OIL',
    text: 'Vùng trán, mũi, cằm có bóng dầu sau vài giờ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 4,
    priority: QuestionPriority.CORE,
    category: 'SKIN_TYPE',
    intent: 'Baumann O/D — T-zone oiliness',
    askWhen: { always: true },
    optionCodes: ['OILY_TENDENCY', 'COMBINATION_TENDENCY', 'DRY_TENDENCY'],
  },
  {
    code: 'PRODUCT_CHANGE_REACTION',
    text: 'Da bạn có dễ đỏ, rát hoặc châm chích khi đổi sản phẩm không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 5,
    priority: QuestionPriority.CORE,
    category: 'SENSITIVITY',
    intent: 'Baumann S/R — product-change sensitivity gate',
    askWhen: { always: true },
    optionCodes: ['SENSITIVE_TENDENCY', 'RESISTANT_TENDENCY'],
  },
  {
    code: 'SENSITIVITY_TRIGGERS',
    text: 'Da bạn có thường đỏ, nóng rát, ngứa hoặc bong tróc không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 6,
    priority: QuestionPriority.CORE,
    category: 'SENSITIVITY',
    intent: 'Screen sensitivity and barrier symptoms without self-diagnosis',
    askWhen: { always: true },
    optionCodes: [
      'REDNESS',
      'BARRIER_DAMAGE',
      'DEHYDRATED_SKIN',
      'ROUGH_TEXTURE',
      'RESISTANT_TENDENCY',
    ],
  },
  {
    code: 'ENVIRONMENT_EXPOSURE',
    text: 'Môi trường bạn tiếp xúc nhiều nhất là gì?',
    questionType: 'MULTI_SELECT',
    displayOrder: 7,
    priority: QuestionPriority.CORE,
    category: 'LIFESTYLE',
    intent: 'Capture climate and exposure context for branching',
    askWhen: { always: true },
    optionCodes: [
      'HOT_HUMID',
      'DRY_COLD',
      'HIGH_SUN_EXPOSURE',
      'URBAN_POLLUTION',
      'AIR_CONDITIONED_ENVIRONMENT',
      'OUTDOOR_LIFESTYLE',
      'INDOOR_LIFESTYLE',
    ],
  },
  {
    code: 'LIFESTYLE',
    text: 'Những yếu tố sinh hoạt nào thường xuyên ảnh hưởng đến da bạn?',
    questionType: 'MULTI_SELECT',
    displayOrder: 8,
    priority: QuestionPriority.CORE,
    category: 'LIFESTYLE',
    intent: 'Capture behavioral lifestyle triggers',
    askWhen: { always: true },
    optionCodes: [
      'NIGHT_SHIFT',
      'POOR_SLEEP',
      'HEAVY_MAKEUP',
      'FREQUENT_EXERCISE',
      'FREQUENT_MASK',
      'SMOKING',
      'HIGH_STRESS',
    ],
  },
  {
    code: 'HAS_ROUTINE',
    text: 'Hiện tại bạn có routine chăm sóc da không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 9,
    priority: QuestionPriority.CORE,
    category: 'ROUTINE',
    intent: 'Establish current routine experience level',
    askWhen: { always: true },
    optionCodes: ['HAS_SKINCARE_ROUTINE', 'NO_SKINCARE_ROUTINE'],
  },
  {
    code: 'SUNSCREEN_HABIT',
    text: 'Bạn có dùng kem chống nắng hằng ngày không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 10,
    priority: QuestionPriority.CORE,
    category: 'ROUTINE',
    intent: 'Sunscreen habit and photoaging / pigmentation risk',
    askWhen: { always: true },
    optionCodes: ['SUNSCREEN_DAILY', 'SUNSCREEN_SOMETIMES', 'SUNSCREEN_RARELY'],
  },
  {
    code: 'CURRENT_ACTIVES',
    text: 'Bạn đang dùng hoạt chất nào?',
    questionType: 'MULTI_SELECT',
    displayOrder: 11,
    priority: QuestionPriority.CORE,
    category: 'ACTIVE_INGREDIENTS',
    intent: 'Detect active exposure to avoid conflicts',
    askWhen: { always: true },
    optionCodes: [
      'USING_AHA',
      'USING_BHA',
      'USING_RETINOID',
      'USING_BENZOYL_PEROXIDE',
      'USING_VITAMIN_C',
      'USING_NIACINAMIDE',
      'NO_ACTIVES',
    ],
  },
  {
    code: 'COSMETIC_REACTION',
    text: 'Bạn có dị ứng hoặc từng phản ứng mạnh với thành phần mỹ phẩm nào không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 12,
    priority: QuestionPriority.CORE,
    category: 'HEALTH_SAFETY',
    intent: 'Safety gate for cosmetic reaction history',
    askWhen: { always: true },
    optionCodes: ['COSMETIC_REACTION_HISTORY', 'NO_COSMETIC_REACTION'],
  },
  {
    code: 'ROUTINE_COMPLEXITY_PREF',
    text: 'Bạn thích routine tối giản hay nhiều bước?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 13,
    priority: QuestionPriority.CORE,
    category: 'PERSONALITY',
    intent: 'Personality — minimalist vs treatment-focused / advanced',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_MINIMALIST',
      'PERSONALITY_TREATMENT_FOCUSED',
      'PREFER_ADVANCED_ROUTINE',
    ],
  },

  // ── L2 Conditional ───────────────────────────────────────────────────────
  {
    code: 'ACNE_DETAILS',
    text: 'Bạn thường gặp loại mụn nào?',
    questionType: 'MULTI_SELECT',
    displayOrder: 20,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACNE',
    intent: 'Refine acne type and post-acne marks',
    askWhen: { anyLabelCodes: ['ACNE', 'BLACKHEADS', 'WHITEHEADS'] },
    optionCodes: [
      'BLACKHEADS',
      'WHITEHEADS',
      'ENLARGED_PORES',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'POST_INFLAMMATORY_ERYTHEMA',
    ],
  },
  {
    code: 'ACNE_SEVERITY',
    text: 'Mụn của bạn có đau, sưng hoặc nằm sâu dưới da không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 21,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACNE',
    intent: 'Estimate acne severity for treatment strength',
    askWhen: { anyLabelCodes: ['ACNE', 'BLACKHEADS', 'WHITEHEADS'] },
    optionCodes: ['ACNE_INFLAMED', 'ACNE_MILD_SURFACE'],
  },
  {
    code: 'ACNE_TRIGGERS',
    text: 'Mụn có nặng hơn khi stress, thức khuya, đeo khẩu trang hoặc trời nóng không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 22,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACNE',
    intent: 'Map acne lifestyle and environment triggers',
    askWhen: {
      anyLabelCodes: ['ACNE', 'HOT_HUMID', 'FREQUENT_MASK', 'HIGH_STRESS'],
    },
    optionCodes: [
      'HIGH_STRESS',
      'NIGHT_SHIFT',
      'POOR_SLEEP',
      'FREQUENT_MASK',
      'HOT_HUMID',
      'FREQUENT_EXERCISE',
    ],
  },
  {
    code: 'ACNE_TREATMENT_PREF',
    text: 'Bạn muốn tập trung giảm mụn nhanh hay giảm mụn nhưng hạn chế kích ứng?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 23,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACNE',
    intent: 'Acne treatment personality — speed vs safety',
    askWhen: { anyLabelCodes: ['ACNE', 'BLACKHEADS', 'WHITEHEADS'] },
    optionCodes: ['QUICK_RESULTS', 'SAFETY_FIRST'],
  },
  {
    code: 'PIGMENTATION_DETAILS',
    text: 'Bạn đang gặp thâm sau mụn, nám/sạm hay da không đều màu?',
    questionType: 'MULTI_SELECT',
    displayOrder: 24,
    priority: QuestionPriority.CONDITIONAL,
    category: 'PIGMENTATION',
    intent: 'Differentiate pigmentation patterns',
    askWhen: {
      anyLabelCodes: [
        'HYPERPIGMENTATION',
        'MELASMA',
        'UNEVEN_SKIN_TONE',
        'PIGMENTED_TENDENCY',
      ],
    },
    optionCodes: [
      'MELASMA',
      'FRECKLES',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'UNEVEN_SKIN_TONE',
    ],
  },
  {
    code: 'PIGMENT_SUN_RESPONSE',
    text: 'Da bạn có dễ sạm hoặc thâm lâu mờ sau khi đi nắng không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 25,
    priority: QuestionPriority.CONDITIONAL,
    category: 'PIGMENTATION',
    intent: 'UV pigmentation response',
    askWhen: {
      match: 'any',
      anyLabelCodes: [
        'HYPERPIGMENTATION',
        'MELASMA',
        'HIGH_SUN_EXPOSURE',
        'PIGMENTED_TENDENCY',
      ],
      anyAgeGroupCodes: ['AGE_26_35', 'AGE_36_45', 'AGE_46_60', 'ABOVE_60'],
      minAge: 25,
    },
    optionCodes: ['PIGMENTED_TENDENCY', 'NON_PIGMENTED_TENDENCY'],
  },
  {
    code: 'EASY_PIH',
    text: 'Sau khi hết mụn, da bạn có dễ để lại thâm không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 26,
    priority: QuestionPriority.CONDITIONAL,
    category: 'PIGMENTATION',
    intent: 'Baumann P/N — post-acne pigmentation risk',
    askWhen: {
      anyLabelCodes: [
        'ACNE',
        'HYPERPIGMENTATION',
        'POST_INFLAMMATORY_HYPERPIGMENTATION',
      ],
    },
    optionCodes: [
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'PIGMENTED_TENDENCY',
      'NON_PIGMENTED_TENDENCY',
    ],
  },
  {
    code: 'REDNESS_TRIGGERS',
    text: 'Tình trạng đỏ/rát có nặng hơn khi ra nắng, stress, ăn cay hoặc đổi thời tiết không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 27,
    priority: QuestionPriority.CONDITIONAL,
    category: 'SENSITIVITY',
    intent: 'Map redness and irritation triggers',
    askWhen: {
      anyLabelCodes: [
        'REDNESS',
        'BARRIER_DAMAGE',
        'SENSITIVE_TENDENCY',
        'REDUCE_REDNESS',
      ],
    },
    optionCodes: [
      'HIGH_SUN_EXPOSURE',
      'HIGH_STRESS',
      'DRY_COLD',
      'HOT_HUMID',
      'FRAGRANCE',
      'ALCOHOL',
    ],
  },
  {
    code: 'SENSITIVITY_RISK_PREF',
    text: 'Bạn muốn routine thật dịu nhẹ hay chấp nhận treatment mạnh hơn nếu hiệu quả nhanh?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 28,
    priority: QuestionPriority.CONDITIONAL,
    category: 'SENSITIVITY',
    intent: 'Risk tolerance for sensitive or irritated skin',
    askWhen: {
      anyLabelCodes: ['REDNESS', 'BARRIER_DAMAGE', 'SENSITIVE_TENDENCY'],
    },
    optionCodes: ['SAFETY_FIRST', 'QUICK_RESULTS'],
  },
  {
    code: 'DRYNESS_WITHOUT_MOISTURIZER',
    text: 'Da bạn có hay bong tróc, sần hoặc căng khi không dùng kem dưỡng không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 29,
    priority: QuestionPriority.CONDITIONAL,
    category: 'SKIN_TYPE',
    intent: 'Baumann O/D — dryness without moisturizer',
    askWhen: {
      anyLabelCodes: [
        'DEHYDRATED_SKIN',
        'DRY_TENDENCY',
        'DRY_COLD',
        'AIR_CONDITIONED_ENVIRONMENT',
        'HYDRATION',
      ],
    },
    optionCodes: ['DRY_TENDENCY', 'DEHYDRATED_SKIN', 'OILY_TENDENCY'],
  },
  {
    code: 'AGING_SIGNS',
    text: 'Bạn có thấy nếp nhăn nhỏ hoặc da kém săn chắc không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 30,
    priority: QuestionPriority.CONDITIONAL,
    category: 'SKIN_TYPE',
    intent: 'Baumann W/T — early aging and firmness',
    askWhen: {
      match: 'any',
      anyLabelCodes: [
        'WRINKLES',
        'FINE_LINES',
        'ANTI_AGING',
        'REDUCE_WRINKLES',
      ],
      anyAgeGroupCodes: ['AGE_26_35', 'AGE_36_45', 'AGE_46_60', 'ABOVE_60'],
      minAge: 25,
    },
    optionCodes: ['WRINKLED_TENDENCY', 'FINE_LINES', 'TIGHT_TENDENCY'],
  },
  {
    code: 'HOT_HUMID_FOLLOWUP',
    text: 'Da bạn có dễ bóng dầu hoặc nổi mụn hơn khi trời nóng ẩm / đổ mồ hôi không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 31,
    priority: QuestionPriority.CONDITIONAL,
    category: 'LIFESTYLE',
    intent: 'Hot-humid oil and acne environment follow-up',
    askWhen: { anyLabelCodes: ['HOT_HUMID', 'FREQUENT_EXERCISE'] },
    optionCodes: [
      'OILY_TENDENCY',
      'ACNE',
      'SUNSCREEN_BREAKOUTS',
      'TEXTURE_LIGHT',
      'FREQUENT_EXERCISE',
    ],
  },
  {
    code: 'AC_DRYNESS',
    text: 'Da bạn có khô căng hơn khi ở máy lạnh lâu không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 32,
    priority: QuestionPriority.CONDITIONAL,
    category: 'LIFESTYLE',
    intent: 'Air-conditioning dehydration follow-up',
    askWhen: { anyLabelCodes: ['AIR_CONDITIONED_ENVIRONMENT'] },
    optionCodes: [
      'DEHYDRATED_SKIN',
      'DRY_TENDENCY',
      'HYDRATION',
      'TEXTURE_RICH',
    ],
  },
  {
    code: 'SUNSCREEN_TOLERANCE',
    text: 'Kem chống nắng có làm bạn bí da hoặc nổi mụn không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 33,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ROUTINE',
    intent: 'Sunscreen texture tolerance',
    askWhen: {
      anyLabelCodes: [
        'HOT_HUMID',
        'ACNE',
        'OILY_TENDENCY',
        'SUNSCREEN_DAILY',
        'SUNSCREEN_SOMETIMES',
      ],
    },
    optionCodes: ['SUNSCREEN_BREAKOUTS', 'TEXTURE_LIGHT', 'NON_COMEDOGENIC'],
  },
  {
    code: 'ACTIVE_TOLERANCE',
    text: 'Mức độ quen thuộc của bạn với hoạt chất chăm sóc da?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 34,
    priority: QuestionPriority.CONDITIONAL,
    category: 'EXPERIENCE_LEVEL',
    intent: 'Estimate tolerance for active ingredient protocols',
    askWhen: {
      anyLabelCodes: [
        'ACNE',
        'WRINKLES',
        'HYPERPIGMENTATION',
        'USING_AHA',
        'USING_BHA',
        'USING_RETINOID',
        'USING_BENZOYL_PEROXIDE',
        'USING_VITAMIN_C',
      ],
    },
    optionCodes: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
  },
  {
    code: 'ACTIVE_FREQUENCY',
    text: 'Bạn dùng treatment bao nhiêu lần mỗi tuần?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 35,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACTIVE_INGREDIENTS',
    intent: 'Active use frequency / strength signal',
    askWhen: {
      anyLabelCodes: [
        'USING_AHA',
        'USING_BHA',
        'USING_RETINOID',
        'USING_BENZOYL_PEROXIDE',
        'USING_VITAMIN_C',
      ],
    },
    optionCodes: [
      'ACTIVE_FREQ_LOW',
      'ACTIVE_FREQ_MODERATE',
      'ACTIVE_FREQ_HIGH',
    ],
  },
  {
    code: 'ACTIVE_IRRITATION_SIGNS',
    text: 'Khi dùng treatment, da có bị khô, rát, bong tróc hoặc nổi mụn nhiều hơn không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 36,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACTIVE_INGREDIENTS',
    intent: 'Active tolerance and irritation signs',
    askWhen: {
      anyLabelCodes: [
        'USING_AHA',
        'USING_BHA',
        'USING_RETINOID',
        'USING_BENZOYL_PEROXIDE',
        'USING_VITAMIN_C',
        'BEGINNER',
        'INTERMEDIATE',
        'ADVANCED',
      ],
    },
    optionCodes: [
      'ACTIVE_IRRITATION',
      'BARRIER_DAMAGE',
      'REDNESS',
      'DEHYDRATED_SKIN',
      'RESISTANT_TENDENCY',
    ],
  },
  {
    code: 'STACKING_ACTIVES',
    text: 'Bạn có dùng nhiều treatment trong cùng một buổi không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 37,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACTIVE_INGREDIENTS',
    intent: 'Active stacking / conflict risk',
    askWhen: {
      anyLabelCodes: [
        'USING_AHA',
        'USING_BHA',
        'USING_RETINOID',
        'USING_BENZOYL_PEROXIDE',
        'USING_VITAMIN_C',
      ],
    },
    optionCodes: ['STACKS_ACTIVES', 'DOES_NOT_STACK_ACTIVES'],
  },
  {
    code: 'DERM_CARE',
    text: 'Bạn có đang được bác sĩ da liễu điều trị không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 38,
    priority: QuestionPriority.CONDITIONAL,
    category: 'HEALTH_SAFETY',
    intent: 'Medical context safety gate',
    askWhen: {
      anyLabelCodes: [
        'COSMETIC_REACTION_HISTORY',
        'ACNE',
        'MELASMA',
        'REDNESS',
        'BARRIER_DAMAGE',
      ],
    },
    optionCodes: ['UNDER_DERM_CARE', 'NOT_UNDER_DERM_CARE'],
  },
  {
    code: 'PRESCRIPTION_MEDS',
    text: 'Bạn có đang dùng thuốc bôi/uống theo toa cho da không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 39,
    priority: QuestionPriority.CONDITIONAL,
    category: 'HEALTH_SAFETY',
    intent: 'Prescription conflict risk',
    askWhen: {
      anyLabelCodes: ['UNDER_DERM_CARE', 'COSMETIC_REACTION_HISTORY'],
    },
    optionCodes: ['PRESCRIPTION_SKIN_MEDS', 'NOT_UNDER_DERM_CARE'],
  },
  {
    code: 'PREGNANCY_STATUS',
    text: 'Bạn hiện đang mang thai hoặc cho con bú không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 40,
    priority: QuestionPriority.CONDITIONAL,
    category: 'HEALTH_SAFETY',
    intent: 'Pregnancy/breastfeeding contraindication gate',
    askWhen: {
      anyLabelCodes: [
        'USING_RETINOID',
        'ANTI_AGING',
        'ACNE',
        'HAS_SKINCARE_ROUTINE',
      ],
    },
    optionCodes: [
      'PREGNANCY',
      'BREASTFEEDING',
      'NOT_PREGNANT_OR_BREASTFEEDING',
      'PREFER_NOT_ANSWER_PREGNANCY',
    ],
  },
  {
    code: 'OPEN_WOUND_CHECK',
    text: 'Hiện tại da bạn có vết thương hở, sưng đau nhiều hoặc dấu hiệu nhiễm trùng không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 41,
    priority: QuestionPriority.CONDITIONAL,
    category: 'HEALTH_SAFETY',
    intent: 'Escalation risk — open wound or infection',
    askWhen: {
      anyLabelCodes: ['ACNE', 'UNDER_DERM_CARE', 'BARRIER_DAMAGE'],
    },
    optionCodes: ['OPEN_WOUND', 'ACTIVE_SKIN_INFECTION', 'NO_OPEN_WOUND'],
  },
  {
    code: 'CLEANSING_HABIT',
    text: 'Bạn có tẩy trang/làm sạch kỹ cuối ngày không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 42,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ROUTINE',
    intent: 'End-of-day cleansing habit',
    askWhen: {
      anyLabelCodes: [
        'HEAVY_MAKEUP',
        'SUNSCREEN_DAILY',
        'SUNSCREEN_SOMETIMES',
        'URBAN_POLLUTION',
      ],
    },
    optionCodes: ['CLEANSING_THOROUGH', 'CLEANSING_BASIC'],
  },
  {
    code: 'ROUTINE_CONSISTENCY',
    text: 'Bạn có thường bỏ qua routine khi bận không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 43,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ROUTINE',
    intent: 'Consistency / low-maintenance signal',
    askWhen: { anyLabelCodes: ['HAS_SKINCARE_ROUTINE'] },
    optionCodes: ['OFTEN_SKIPS_ROUTINE', 'HAS_SKINCARE_ROUTINE'],
  },

  // ── L2 Age-gated (profile DOB → AGE_GROUP / minAge-maxAge) ───────────────
  {
    code: 'AGE_U18_ACNE_SITES',
    text: 'Bạn có thường bị mụn ở trán, má, cằm hoặc lưng không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 44,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: 'Under-18 teen acne screening',
    askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
    optionCodes: ['ACNE', 'BLACKHEADS', 'WHITEHEADS', 'ENLARGED_PORES'],
  },
  {
    code: 'AGE_U18_OILINESS',
    text: 'Da bạn có thường bóng dầu sau vài giờ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 45,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: 'Under-18 oiliness',
    askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
    optionCodes: ['OILY_TENDENCY', 'COMBINATION_TENDENCY', 'DRY_TENDENCY'],
  },
  {
    code: 'AGE_U18_CLEANSE_HABIT',
    text: 'Bạn rửa mặt/làm sạch da theo hướng nào?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 46,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: 'Under-18 cleansing habit',
    askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
    optionCodes: ['CLEANSING_THOROUGH', 'CLEANSING_BASIC'],
  },
  {
    code: 'AGE_U18_MASK_SWEAT',
    text: 'Bạn có thường đeo khẩu trang hoặc vận động ra mồ hôi nhiều không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 47,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: 'Under-18 acne triggers',
    askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
    optionCodes: ['FREQUENT_MASK', 'FREQUENT_EXERCISE', 'HOT_HUMID'],
  },
  {
    code: 'AGE_U18_RX_ACNE',
    text: 'Bạn có đang dùng thuốc trị mụn theo hướng dẫn bác sĩ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 48,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: 'Under-18 prescription acne safety',
    askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
    optionCodes: ['PRESCRIPTION_SKIN_MEDS', 'NOT_UNDER_DERM_CARE'],
  },
  {
    code: 'AGE_1825_POST_ACNE_MARKS',
    text: 'Sau khi hết mụn, da bạn có hay để lại thâm không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 49,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '18–25 post-acne PIH',
    askWhen: { anyAgeGroupCodes: ['AGE_18_25'], minAge: 18, maxAge: 25 },
    optionCodes: [
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'PIGMENTED_TENDENCY',
      'NON_PIGMENTED_TENDENCY',
    ],
  },
  {
    code: 'AGE_1825_ACTIVE_IRRITATION',
    text: 'Khi dùng treatment, da bạn có bị rát, bong tróc hoặc đỏ không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 50,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '18–25 active tolerance',
    askWhen: { anyAgeGroupCodes: ['AGE_18_25'], minAge: 18, maxAge: 25 },
    optionCodes: [
      'ACTIVE_IRRITATION',
      'REDNESS',
      'BARRIER_DAMAGE',
      'RESISTANT_TENDENCY',
    ],
  },
  {
    code: 'AGE_1825_SUNSCREEN_FIT',
    text: 'Kem chống nắng có làm bạn bí da hoặc nổi mụn không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 51,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '18–25 sunscreen fit',
    askWhen: { anyAgeGroupCodes: ['AGE_18_25'], minAge: 18, maxAge: 25 },
    optionCodes: ['SUNSCREEN_BREAKOUTS', 'TEXTURE_LIGHT', 'NON_COMEDOGENIC'],
  },
  {
    code: 'AGE_1825_LIFESTYLE_SKIN',
    text: 'Da bạn có xấu hơn khi thức khuya, stress hoặc ăn uống thất thường không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 52,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '18–25 lifestyle skin triggers',
    askWhen: { anyAgeGroupCodes: ['AGE_18_25'], minAge: 18, maxAge: 25 },
    optionCodes: ['NIGHT_SHIFT', 'POOR_SLEEP', 'HIGH_STRESS'],
  },
  {
    code: 'AGE_2635_ADULT_ACNE',
    text: 'Mụn của bạn có thường xuất hiện ở cằm, quai hàm hoặc theo chu kỳ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 53,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '26–35 adult / hormonal acne pattern',
    askWhen: { anyAgeGroupCodes: ['AGE_26_35'], minAge: 26, maxAge: 35 },
    optionCodes: ['ACNE', 'ACNE_INFLAMED', 'ACNE_MILD_SURFACE'],
  },
  {
    code: 'AGE_2635_UNEVEN_TONE',
    text: 'Da bạn có vùng không đều màu hoặc vết thâm lâu mờ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 54,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '26–35 pigmentation / uneven tone',
    askWhen: { anyAgeGroupCodes: ['AGE_26_35'], minAge: 26, maxAge: 35 },
    optionCodes: [
      'UNEVEN_SKIN_TONE',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'HYPERPIGMENTATION',
    ],
  },
  {
    code: 'AGE_2635_EARLY_AGING',
    text: 'Bạn có bắt đầu thấy nếp nhăn nhỏ ở mắt, trán hoặc khóe miệng không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 55,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '26–35 early aging',
    askWhen: { anyAgeGroupCodes: ['AGE_26_35'], minAge: 26, maxAge: 35 },
    optionCodes: ['FINE_LINES', 'WRINKLED_TENDENCY', 'TIGHT_TENDENCY'],
  },
  {
    code: 'AGE_2635_ROUTINE_CONSISTENCY',
    text: 'Bạn có duy trì routine đều sáng/tối không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 56,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '26–35 routine consistency',
    askWhen: { anyAgeGroupCodes: ['AGE_26_35'], minAge: 26, maxAge: 35 },
    optionCodes: [
      'PERSONALITY_CONSISTENCY_FOCUSED',
      'OFTEN_SKIPS_ROUTINE',
      'PERSONALITY_LOW_MAINTENANCE',
    ],
  },
  {
    code: 'AGE_3645_MELASMA',
    text: 'Bạn có vùng nám, sạm hoặc đốm nâu xuất hiện lâu ngày không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 57,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '36–45 melasma / persistent spots',
    askWhen: { anyAgeGroupCodes: ['AGE_36_45'], minAge: 36, maxAge: 45 },
    optionCodes: ['MELASMA', 'HYPERPIGMENTATION', 'FRECKLES'],
  },
  {
    code: 'AGE_3645_FIRMNESS',
    text: 'Bạn có thấy da kém săn chắc hoặc xuất hiện nếp nhăn rõ hơn không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 58,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '36–45 aging / firmness',
    askWhen: { anyAgeGroupCodes: ['AGE_36_45'], minAge: 36, maxAge: 45 },
    optionCodes: [
      'WRINKLED_TENDENCY',
      'WRINKLES',
      'FINE_LINES',
      'TIGHT_TENDENCY',
    ],
  },
  {
    code: 'AGE_3645_DRYNESS',
    text: 'Da bạn có dễ khô căng hơn trước không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 59,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '36–45 hydration shift',
    askWhen: { anyAgeGroupCodes: ['AGE_36_45'], minAge: 36, maxAge: 45 },
    optionCodes: ['DRY_TENDENCY', 'DEHYDRATED_SKIN', 'HYDRATION'],
  },
  {
    code: 'AGE_3645_TREATMENT_HISTORY',
    text: 'Bạn đã từng dùng retinoid, peel, laser hoặc treatment chuyên sâu chưa?',
    questionType: 'MULTI_SELECT',
    displayOrder: 60,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '36–45 treatment history',
    askWhen: { anyAgeGroupCodes: ['AGE_36_45'], minAge: 36, maxAge: 45 },
    optionCodes: [
      'USING_RETINOID',
      'RECENT_CHEMICAL_PEEL',
      'RECENT_LASER_TREATMENT',
      'NO_ACTIVES',
    ],
  },
  {
    code: 'AGE_4660_BARRIER',
    text: 'Da bạn có dễ khô, mỏng, căng hoặc nhạy cảm hơn trước không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 61,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '46–60 barrier / sensitivity shift',
    askWhen: { anyAgeGroupCodes: ['AGE_46_60'], minAge: 46, maxAge: 60 },
    optionCodes: [
      'DRY_TENDENCY',
      'BARRIER_DAMAGE',
      'SENSITIVE_TENDENCY',
      'DEHYDRATED_SKIN',
    ],
  },
  {
    code: 'AGE_4660_WRINKLE_DEPTH',
    text: 'Nếp nhăn của bạn chủ yếu là nếp nhỏ hay rãnh sâu hơn?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 62,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '46–60 wrinkle severity',
    askWhen: { anyAgeGroupCodes: ['AGE_46_60'], minAge: 46, maxAge: 60 },
    optionCodes: ['FINE_LINES', 'WRINKLES', 'WRINKLED_TENDENCY'],
  },
  {
    code: 'AGE_4660_HORMONAL',
    text: 'Bạn có đang trong giai đoạn thay đổi nội tiết không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 63,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '46–60 hormonal context',
    askWhen: { anyAgeGroupCodes: ['AGE_46_60'], minAge: 46, maxAge: 60 },
    optionCodes: ['HORMONAL_CHANGES', 'NO_HORMONAL_CHANGES'],
  },
  {
    code: 'AGE_4660_ACTIVE_TOLERANCE',
    text: 'Da bạn có dễ kích ứng với hoạt chất mạnh hơn trước không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 64,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '46–60 declining active tolerance',
    askWhen: { anyAgeGroupCodes: ['AGE_46_60'], minAge: 46, maxAge: 60 },
    optionCodes: [
      'ACTIVE_IRRITATION',
      'PERSONALITY_SENSITIVE_CARE',
      'PERSONALITY_TREATMENT_FOCUSED',
    ],
  },
  {
    code: 'AGE_60_DRYNESS',
    text: 'Da bạn có thường khô, căng, bong tróc hoặc dễ tổn thương không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 65,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '55+ dryness / fragility',
    askWhen: { anyAgeGroupCodes: ['ABOVE_60'], minAge: 55 },
    optionCodes: [
      'DRY_TENDENCY',
      'DEHYDRATED_SKIN',
      'BARRIER_DAMAGE',
      'ROUGH_TEXTURE',
    ],
  },
  {
    code: 'AGE_60_SENSITIVITY',
    text: 'Da bạn có dễ đỏ, ngứa hoặc rát khi dùng sản phẩm mới không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 66,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '55+ sensitivity',
    askWhen: { anyAgeGroupCodes: ['ABOVE_60'], minAge: 55 },
    optionCodes: ['SENSITIVE_TENDENCY', 'RESISTANT_TENDENCY', 'REDNESS'],
  },
  {
    code: 'AGE_60_ROUTINE_STYLE',
    text: 'Bạn muốn routine càng đơn giản càng tốt hay vẫn muốn chăm sóc chuyên sâu?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 67,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '55+ routine personality',
    askWhen: { anyAgeGroupCodes: ['ABOVE_60'], minAge: 55 },
    optionCodes: [
      'PERSONALITY_MINIMALIST',
      'PERSONALITY_LOW_MAINTENANCE',
      'PERSONALITY_TREATMENT_FOCUSED',
    ],
  },
  {
    code: 'AGE_60_GOALS',
    text: 'Bạn muốn tập trung vào cấp ẩm, làm sáng hay hỗ trợ săn chắc?',
    questionType: 'MULTI_SELECT',
    displayOrder: 68,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '55+ goal focus',
    askWhen: { anyAgeGroupCodes: ['ABOVE_60'], minAge: 55 },
    optionCodes: ['HYDRATION', 'BRIGHTENING', 'ANTI_AGING', 'BARRIER_REPAIR'],
  },
  {
    code: 'AGE_60_GENTLE_PREF',
    text: 'Bạn có ưu tiên sản phẩm không hương liệu, dịu nhẹ không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 69,
    priority: QuestionPriority.CONDITIONAL,
    category: 'AGE_SEGMENT',
    intent: '55+ gentle product preference',
    askWhen: { anyAgeGroupCodes: ['ABOVE_60'], minAge: 55 },
    optionCodes: [
      'FRAGRANCE_FREE',
      'HYPOALLERGENIC',
      'PERSONALITY_SENSITIVE_CARE',
    ],
  },

  // ── L3 Optional / personality & preference ───────────────────────────────
  {
    code: 'PERSONALITY_TYPES',
    text: 'Những kiểu chăm sóc da nào giống bạn nhất?',
    questionType: 'MULTI_SELECT',
    displayOrder: 80,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Capture all GlowScan personality types',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_MINIMALIST',
      'PERSONALITY_TREATMENT_FOCUSED',
      'PERSONALITY_SENSITIVE_CARE',
      'PERSONALITY_BEAUTY_EXPLORER',
      'PERSONALITY_BUDGET_CONSCIOUS',
      'PERSONALITY_CONSISTENCY_FOCUSED',
      'PERSONALITY_QUICK_RESULT',
      'PERSONALITY_SAFETY_FIRST',
      'PERSONALITY_PREMIUM',
      'PERSONALITY_EVIDENCE_DRIVEN',
      'PERSONALITY_LOW_MAINTENANCE',
      'PERSONALITY_PROBLEM_SOLVER',
    ],
  },
  {
    code: 'RISK_TOLERANCE',
    text: 'Bạn muốn hiệu quả nhanh hay ưu tiên ít kích ứng?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 81,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — quick-result vs safety-first',
    askWhen: { always: true },
    optionCodes: ['PERSONALITY_QUICK_RESULT', 'PERSONALITY_SAFETY_FIRST'],
  },
  {
    code: 'GOAL_STYLE',
    text: 'Bạn muốn tập trung xử lý một vấn đề chính hay cải thiện tổng thể?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 82,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — problem-solver vs holistic',
    askWhen: { always: true },
    optionCodes: ['PERSONALITY_PROBLEM_SOLVER', 'FOCUS_OVERALL'],
  },
  {
    code: 'LOW_MAINTENANCE_PREF',
    text: 'Bạn có dễ bỏ routine nếu quá phức tạp không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 83,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — low-maintenance vs consistency-focused',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_LOW_MAINTENANCE',
      'PERSONALITY_CONSISTENCY_FOCUSED',
    ],
  },
  {
    code: 'SENSITIVE_VS_TREATMENT',
    text: 'Bạn ưu tiên routine dịu nhẹ phục hồi hay chấp nhận treatment mạnh để thấy hiệu quả?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 84,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — sensitive-care vs treatment-focused',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_SENSITIVE_CARE',
      'PERSONALITY_TREATMENT_FOCUSED',
    ],
  },
  {
    code: 'EVIDENCE_PREF',
    text: 'Bạn có muốn biết rõ vì sao sản phẩm được đề xuất không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 85,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — evidence-driven',
    askWhen: { always: true },
    optionCodes: ['PERSONALITY_EVIDENCE_DRIVEN', 'STICK_TO_FAMILIAR'],
  },
  {
    code: 'TEXTURE_PREF',
    text: 'Bạn thích sản phẩm có texture như thế nào?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 86,
    priority: QuestionPriority.OPTIONAL,
    category: 'PRODUCT_PREFERENCE',
    intent: 'Texture preference for recommendations',
    askWhen: { always: true },
    optionCodes: ['TEXTURE_LIGHT', 'TEXTURE_RICH'],
  },
  {
    code: 'FINISH_PREF',
    text: 'Bạn thích finish ráo mặt, ẩm mượt hay glowy?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 87,
    priority: QuestionPriority.OPTIONAL,
    category: 'PRODUCT_PREFERENCE',
    intent: 'Finish preference',
    askWhen: { always: true },
    optionCodes: ['FINISH_MATTE', 'FINISH_DEWY', 'FINISH_GLOWY'],
  },
  {
    code: 'FRAGRANCE_PREF',
    text: 'Bạn thích sản phẩm không mùi, có mùi nhẹ hay không quan trọng?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 88,
    priority: QuestionPriority.OPTIONAL,
    category: 'PRODUCT_PREFERENCE',
    intent: 'Sensory / fragrance preference',
    askWhen: { always: true },
    optionCodes: [
      'FRAGRANCE_FREE',
      'HYPOALLERGENIC',
      'NO_FRAGRANCE_PREFERENCE',
    ],
  },
  {
    code: 'BUDGET_PREF',
    text: 'Bạn muốn routine tiết kiệm, cân bằng hay cao cấp?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 89,
    priority: QuestionPriority.OPTIONAL,
    category: 'PRODUCT_PREFERENCE',
    intent: 'Budget personality for product fit',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_BUDGET_CONSCIOUS',
      'BUDGET_BALANCED',
      'PERSONALITY_PREMIUM',
    ],
  },
  {
    code: 'OPENNESS_PREF',
    text: 'Bạn thích thử sản phẩm mới hay dùng sản phẩm quen thuộc?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 90,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — beauty-explorer vs familiar',
    askWhen: { always: true },
    optionCodes: ['PERSONALITY_BEAUTY_EXPLORER', 'STICK_TO_FAMILIAR'],
  },
  {
    code: 'TREATMENT_STRENGTH_PREF',
    text: 'Bạn có sẵn sàng dùng treatment cần thời gian làm quen không?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 91,
    priority: QuestionPriority.OPTIONAL,
    category: 'PERSONALITY',
    intent: 'Personality — treatment tolerance',
    askWhen: { always: true },
    optionCodes: [
      'PERSONALITY_TREATMENT_FOCUSED',
      'PERSONALITY_SAFETY_FIRST',
      'PERSONALITY_SENSITIVE_CARE',
    ],
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
    protocolCode: 'glycolic_exfoliation',
    labelCode: 'ROUGH_TEXTURE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'benzoyl_acne',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  // Step-role protocols (drive clearer routine HDSD)
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

/** Seed stock so recommendation stock filter (remainingQuantity > 0) passes. */
const SEED_STOCK_QTY = 20;
const SEED_STOCK_BATCHES: Array<{ sku: string; batchCode: string }> =
  PRODUCTS.map((p) => ({
    sku: p.sku,
    batchCode: `SEED-${p.sku}`,
  }));

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

/** Mon-Fri recurring availability blocks (dayOfWeek 1-5), hours in GMT+7. */
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
  row.vietnameseNormalized = seed.vietnameseNormalized;
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
      vietnameseNormalized: seed.vietnameseNormalized,
      categoryId,
      isActive: seed.isActive ?? true,
    });
    return repo.save(row);
  }
  row.name = seed.name;
  row.description = seed.description;
  row.vietnameseNormalized = seed.vietnameseNormalized;
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
  instructions?: string | null,
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
      instructions: instructions ?? null,
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
  protocol.instructions = instructions ?? null;
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
): Promise<Product> {
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
    variant.weightGram = deriveWeightGram(seed);
    variant.imageUrl = 'https://placehold.co/400';
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
        weightGram: deriveWeightGram(seed),
        imageUrl: 'https://placehold.co/400',
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

  return product;
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
  const productProtocolRepo = AppDataSource.getRepository(ProductProtocol);
  const questionRepo = AppDataSource.getRepository(Question);
  const questionOptionRepo = AppDataSource.getRepository(QuestionOption);
  const commerceSettingRepo = AppDataSource.getRepository(CommerceSetting);
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

  const productsBySku = new Map<string, Product>();
  for (const productSeed of PRODUCTS) {
    const category = productCategoriesByCode.get(productSeed.categoryCode);
    if (!category) continue;

    const brand = await upsertProductBrand(
      productBrandRepo,
      productSeed.brandName,
    );
    const product = await upsertProductWithVariant(
      productRepo,
      productVariantRepo,
      productIngredientRepo,
      productSeed,
      brand.id,
      category.id,
      ingredientsByName,
    );
    productsBySku.set(productSeed.sku, product);
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
    instructions?: string | null;
  }> = [
    {
      code: 'retinol_0.3_anti_aging',
      name: 'Retinol 0.3% Anti-Aging',
      ingredientName: 'Retinol',
      concentrationPct: 0.3,
      timePerWeek: 3,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: 12,
      instructions:
        'Apply a pea-sized amount to dry face at night after cleansing. Start 2–3 nights/week, avoid eye area, and always use sunscreen the next morning.',
    },
    {
      code: 'salicylic_acne',
      name: 'Salicylic Acid 2% Acne',
      ingredientName: 'Salicylic Acid',
      concentrationPct: 2,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: 8,
      instructions:
        'Sweep a thin layer over clean skin focusing on oily/acne-prone zones. Do not layer with strong AHA the same night if skin stings.',
    },
    {
      code: 'azelaic_pigmentation',
      name: 'Azelaic Acid 10% Pigmentation',
      ingredientName: 'Azelaic Acid',
      concentrationPct: 10,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: 12,
      instructions:
        'Apply a thin layer to pigmented or acne-prone areas. Can be used morning and/or night under moisturizer. Patch-test if sensitive.',
    },
    {
      code: 'ceramide_barrier',
      name: 'Ceramide Barrier Repair',
      ingredientName: 'Ceramide',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'Press a pea-sized amount over face and neck to seal in moisture and support the skin barrier. Use morning and night as the last leave-on step (before sunscreen in the morning).',
    },
    {
      code: 'ha_hydration',
      name: 'Hyaluronic Acid Hydration',
      ingredientName: 'Hyaluronic Acid',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'On damp skin, apply 2–3 drops and press in. Follow with moisturizer so hydration does not evaporate.',
    },
    {
      code: 'niacinamide_general',
      name: 'Niacinamide 5% General',
      ingredientName: 'Niacinamide',
      concentrationPct: 5,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'Apply 2–3 drops to clean face. Wait ~1 minute before the next product. Suitable morning and night.',
    },
    {
      code: 'glycolic_exfoliation',
      name: 'Glycolic Acid 7% Exfoliation',
      ingredientName: 'Glycolic Acid',
      concentrationPct: 7,
      timePerWeek: 2,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: 8,
      instructions:
        'At night only, apply a thin layer after cleansing. Limit to 2–3 nights/week. Avoid stacking with retinol or BHA on the same night if irritated.',
    },
    {
      code: 'benzoyl_acne',
      name: 'Benzoyl Peroxide 2.5% Acne',
      ingredientName: 'Benzoyl Peroxide',
      concentrationPct: 2.5,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM,
      durationWeeks: 8,
      instructions:
        'Apply a thin layer to acne spots or oily T-zone in the morning. May bleach fabrics—let it dry fully. Moisturize after if skin feels dry.',
    },
    // Category / step-role protocols for specific mock routines
    {
      code: 'cleanser_gentle_foam',
      name: 'Gentle Foaming Cleanser',
      ingredientName: 'Ceramide',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'Wet face, dispense a pea-sized amount, lather, and massage 30–60 seconds. Rinse thoroughly with lukewarm water and pat dry. Use morning and night as step 1.',
    },
    {
      code: 'toner_exfoliating',
      name: 'Exfoliating Toner',
      ingredientName: 'Glycolic Acid',
      timePerWeek: 5,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: null,
      instructions:
        'After cleansing at night, soak a cotton pad or pour a small amount into palms and sweep/press over face. Avoid eye area. Wait 1–2 minutes before serum. Start every other night if new to acids.',
    },
    {
      code: 'serum_niacinamide',
      name: 'Niacinamide Treatment Serum',
      ingredientName: 'Niacinamide',
      concentrationPct: 10,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'Apply 2–3 drops to clean, dry face. Gently pat until absorbed. Wait about 1 minute before moisturizer or sunscreen.',
    },
    {
      code: 'moisturizer_barrier',
      name: 'Barrier Moisturizer',
      ingredientName: 'Ceramide',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM_PM,
      durationWeeks: null,
      instructions:
        'Take a pea-sized amount and massage over face and neck until absorbed. Use as the last leave-on step at night; in the morning apply before sunscreen.',
    },
    {
      code: 'sunscreen_daily_spf',
      name: 'Daily Broad-Spectrum Sunscreen',
      ingredientName: 'Hyaluronic Acid',
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM,
      durationWeeks: null,
      instructions:
        'As the final morning step, apply two finger-lengths (about 1/4 tsp for face) evenly. Reapply every 2–3 hours if outdoors. Do not skip on cloudy days.',
    },
    {
      code: 'treatment_acne_spot',
      name: 'Targeted Acne Treatment',
      ingredientName: 'Benzoyl Peroxide',
      concentrationPct: 2.5,
      timePerWeek: 7,
      timeOfUse: TimeOfUse.AM,
      durationWeeks: 8,
      instructions:
        'After cleansing (and toner if used), apply a thin layer to active breakouts or oily zones. Allow to dry, then moisturize. Use sunscreen during the day.',
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
      def.instructions,
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

  for (const mapping of PRODUCT_PROTOCOL_MAPPINGS) {
    const product = productsBySku.get(mapping.sku);
    const protocol = protocolsByCode.get(mapping.protocolCode);
    if (!product || !protocol) continue;

    const existing = await productProtocolRepo.findOneBy({
      productId: product.id,
      protocolId: protocol.id,
    });
    if (!existing) {
      await productProtocolRepo.save(
        productProtocolRepo.create({
          productId: product.id,
          protocolId: protocol.id,
        }),
      );
    }
  }

  // Ensure every seeded SKU has sellable stock (recommendation stock filter).
  const stockBatchRepo = AppDataSource.getRepository(StockBatch);
  const productInstanceRepo = AppDataSource.getRepository(ProductInstance);
  const stockMovementRepo = AppDataSource.getRepository(StockMovement);
  const manufacturingDate = new Date('2026-01-01');
  const expirationDate = new Date('2028-01-01');

  for (const stockSeed of SEED_STOCK_BATCHES) {
    const variant = await productVariantRepo.findOneBy({ sku: stockSeed.sku });
    if (!variant) continue;

    let batch = await stockBatchRepo.findOneBy({
      productVariantId: variant.id,
      batchCode: stockSeed.batchCode,
    });
    if (!batch) {
      batch = await stockBatchRepo.save(
        stockBatchRepo.create({
          productVariantId: variant.id,
          batchCode: stockSeed.batchCode,
          initialQuantity: SEED_STOCK_QTY,
          remainingQuantity: SEED_STOCK_QTY,
          manufacturingDate,
          expirationDate,
        }),
      );
      await stockMovementRepo.save(
        stockMovementRepo.create({
          batchId: batch.id,
          type: StockMovementType.IMPORT,
          quantity: SEED_STOCK_QTY,
          note: 'Seed initial stock',
        }),
      );
      const instances = Array.from({ length: SEED_STOCK_QTY }, () =>
        productInstanceRepo.create({
          stockBatchId: batch!.id,
          status: ProductInstanceStatus.ON_RACK,
        }),
      );
      await productInstanceRepo.save(instances);
    } else if (batch.remainingQuantity <= 0) {
      batch.remainingQuantity = SEED_STOCK_QTY;
      batch.initialQuantity = Math.max(batch.initialQuantity, SEED_STOCK_QTY);
      await stockBatchRepo.save(batch);
      const onRack = await productInstanceRepo.count({
        where: {
          stockBatchId: batch.id,
          status: ProductInstanceStatus.ON_RACK,
        },
      });
      if (onRack < SEED_STOCK_QTY) {
        const toCreate = SEED_STOCK_QTY - onRack;
        const instances = Array.from({ length: toCreate }, () =>
          productInstanceRepo.create({
            stockBatchId: batch!.id,
            status: ProductInstanceStatus.ON_RACK,
          }),
        );
        await productInstanceRepo.save(instances);
      }
    }
  }

  for (const q of SURVEY_QUESTIONS) {
    const existing = await questionRepo.findOneBy({ code: q.code });
    let question: Question;
    if (!existing) {
      question = await questionRepo.save(
        questionRepo.create({
          code: q.code,
          text: q.text,
          questionType: q.questionType,
          displayOrder: q.displayOrder,
          priority: q.priority,
          category: q.category,
          intent: q.intent,
          askWhen: q.askWhen,
          isActive: true,
        }),
      );
    } else {
      existing.text = q.text;
      existing.questionType = q.questionType;
      existing.displayOrder = q.displayOrder;
      existing.priority = q.priority;
      existing.category = q.category;
      existing.intent = q.intent;
      existing.askWhen = q.askWhen;
      existing.isActive = true;
      question = await questionRepo.save(existing);
    }

    for (const [displayOrder, labelCode] of q.optionCodes.entries()) {
      const label = labelsByCode.get(labelCode);
      if (!label) {
        throw new Error(
          `Question ${q.code} references unknown label ${labelCode}`,
        );
      }
      const option = await questionOptionRepo.findOneBy({
        questionId: question.id,
        labelId: label.id,
      });
      if (!option) {
        await questionOptionRepo.save(
          questionOptionRepo.create({
            questionId: question.id,
            labelId: label.id,
            displayOrder,
            isActive: true,
          }),
        );
      } else {
        option.displayOrder = displayOrder;
        option.isActive = true;
        await questionOptionRepo.save(option);
      }
    }
  }

  const existingComboSetting = await commerceSettingRepo.findOneBy({
    key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
  });
  if (!existingComboSetting) {
    await commerceSettingRepo.save(
      commerceSettingRepo.create({
        key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
        value: '10',
        updatedByUserId: null,
      }),
    );
  }

  const existingMinSubtotalSetting = await commerceSettingRepo.findOneBy({
    key: CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
  });
  if (!existingMinSubtotalSetting) {
    await commerceSettingRepo.save(
      commerceSettingRepo.create({
        key: CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
        value: '300000',
        updatedByUserId: null,
      }),
    );
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
            avatarUrl: 'https://placehold.co/400',
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
        expert.avatarUrl = 'https://placehold.co/400';
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
        source: OrderSource.CATALOG,
        subtotalVnd: 199000,
        discountVnd: 0,
        discountType: null,
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
