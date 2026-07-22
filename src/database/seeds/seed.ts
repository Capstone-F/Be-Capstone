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
import { ShelfLifeUnit } from '../../stock/enums';
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
import { DeliveryFee } from '../../delivery/delivery-fee.entity';
import { DeliveryType } from '../../delivery/enums';
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
  ingredients: ProductIngredientSeed[];
};

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
];

const DELIVERY_PROVIDERS = [
  { code: 'GHN', name: 'Giao Hàng Nhanh' },
  { code: 'GHTK', name: 'Giao Hàng Tiết Kiệm' },
  { code: 'VIETTEL_POST', name: 'Viettel Post' },
  { code: 'JT_EXPRESS', name: 'J&T Express' },
];

const DELIVERY_FEE_BY_TYPE: Record<DeliveryType, number> = {
  [DeliveryType.STANDARD]: 30000,
  [DeliveryType.EXPRESS]: 50000,
  [DeliveryType.SAME_DAY]: 80000,
};

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
    text: 'Bạn muốn cải thiện điều gì cho làn da?',
    questionType: 'MULTI_SELECT',
    displayOrder: 2,
    priority: QuestionPriority.CORE,
    category: 'SKIN_GOAL',
    intent: 'Capture desired skincare outcomes',
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
    code: 'LIFESTYLE',
    text: 'Những yếu tố sinh hoạt nào thường xuyên ảnh hưởng đến bạn?',
    questionType: 'MULTI_SELECT',
    displayOrder: 3,
    priority: QuestionPriority.CORE,
    category: 'LIFESTYLE',
    intent: 'Capture environmental and behavioral exposure',
    askWhen: { always: true },
    optionCodes: [
      'OUTDOOR_LIFESTYLE',
      'INDOOR_LIFESTYLE',
      'NIGHT_SHIFT',
      'HIGH_SUN_EXPOSURE',
      'HEAVY_MAKEUP',
      'FREQUENT_EXERCISE',
      'AIR_CONDITIONED_ENVIRONMENT',
      'SMOKING',
      'HIGH_STRESS',
    ],
  },
  {
    code: 'SENSITIVITY_TRIGGERS',
    text: 'Da bạn có thường đỏ, nóng rát hoặc châm chích không?',
    questionType: 'MULTI_SELECT',
    displayOrder: 4,
    priority: QuestionPriority.CORE,
    category: 'SENSITIVITY',
    intent: 'Screen for sensitivity and barrier concerns',
    askWhen: { always: true },
    optionCodes: ['REDNESS', 'BARRIER_DAMAGE', 'ROSACEA'],
  },
  {
    code: 'ACNE_DETAILS',
    text: 'Tình trạng mụn nào giống với da bạn nhất?',
    questionType: 'MULTI_SELECT',
    displayOrder: 10,
    priority: QuestionPriority.CONDITIONAL,
    category: 'ACNE',
    intent: 'Refine acne type and post-acne concerns',
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
    code: 'PIGMENTATION_DETAILS',
    text: 'Dạng thâm sạm nào bạn quan sát thấy rõ nhất?',
    questionType: 'MULTI_SELECT',
    displayOrder: 11,
    priority: QuestionPriority.CONDITIONAL,
    category: 'PIGMENTATION',
    intent: 'Differentiate common pigmentation patterns',
    askWhen: {
      anyLabelCodes: ['HYPERPIGMENTATION', 'MELASMA', 'UNEVEN_SKIN_TONE'],
    },
    optionCodes: [
      'MELASMA',
      'FRECKLES',
      'POST_INFLAMMATORY_HYPERPIGMENTATION',
      'UNEVEN_SKIN_TONE',
    ],
  },
  {
    code: 'ACTIVE_TOLERANCE',
    text: 'Mức độ quen thuộc của bạn với hoạt chất chăm sóc da?',
    questionType: 'SINGLE_CHOICE',
    displayOrder: 12,
    priority: QuestionPriority.CONDITIONAL,
    category: 'EXPERIENCE_LEVEL',
    intent: 'Estimate tolerance for active ingredient protocols',
    askWhen: {
      anyLabelCodes: ['ACNE', 'WRINKLES', 'HYPERPIGMENTATION'],
    },
    optionCodes: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
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
    protocolCode: 'treatment_acne_spot',
    labelCode: 'ACNE_TREATMENT',
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
  const deliveryFeeRepo = AppDataSource.getRepository(DeliveryFee);
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

  const providers = await deliveryProviderRepo.find();
  for (const provider of providers) {
    for (const type of Object.values(DeliveryType)) {
      const existingFee = await deliveryFeeRepo.findOneBy({
        providerId: provider.id,
        type,
      });
      if (!existingFee) {
        await deliveryFeeRepo.save(
          deliveryFeeRepo.create({
            providerId: provider.id,
            type,
            feeVnd: DELIVERY_FEE_BY_TYPE[type],
            isActive: true,
          }),
        );
      }
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
