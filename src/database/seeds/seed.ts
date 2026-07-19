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
    name: 'Vấn đề về da',
    description: 'Các tình trạng da đang gặp phải cần được cải thiện',
  },
  {
    code: 'SKIN_GOAL',
    name: 'Mục tiêu chăm sóc da',
    description: 'Những kết quả mong muốn đạt được khi sử dụng liệu trình',
  },
  {
    code: 'ALLERGY',
    name: 'Dị ứng thành phần',
    description:
      'Các thành phần mỹ phẩm từng gây kích ứng hoặc dị ứng cần tránh',
  },
  {
    code: 'CONTRAINDICATION',
    name: 'Chống chỉ định',
    description: 'Các yếu tố sinh lý hoặc y tế cần chú ý khi chọn hoạt chất',
  },
  {
    code: 'AGE_GROUP',
    name: 'Độ tuổi',
    description: 'Nhóm tuổi của khách hàng để tư vấn độ mạnh hoạt chất phù hợp',
  },
  {
    code: 'GENDER',
    name: 'Giới tính',
    description: 'Giới tính của khách hàng',
  },
  {
    code: 'LIFESTYLE',
    name: 'Thói quen sinh hoạt',
    description: 'Môi trường sống và thói quen hàng ngày ảnh hưởng đến làn da',
  },
  {
    code: 'EXPERIENCE_LEVEL',
    name: 'Kinh nghiệm dưỡng da',
    description: 'Mức độ quen thuộc với các hoạt chất chuyên sâu',
  },
  {
    code: 'PRODUCT_PREFERENCE',
    name: 'Sở thích sản phẩm',
    description: 'Các tiêu chí ưu tiên khi lựa chọn sản phẩm chăm sóc da',
  },
];

const LABELS: LabelSeed[] = [
  // SKIN_CONCERN
  {
    code: 'ACNE',
    name: 'Mụn sưng, mụn viêm hoặc mụn trứng cá',
    categoryCode: 'SKIN_CONCERN',
    description: 'Da có các nốt mụn sưng đỏ, viêm hoặc mụn bọc gây khó chịu',
  },
  {
    code: 'BLACKHEADS',
    name: 'Mụn đầu đen, mụn cám',
    categoryCode: 'SKIN_CONCERN',
    description: 'Mụn đầu đen hoặc mụn cám lấm tấm vùng mũi và cằm',
  },
  {
    code: 'WHITEHEADS',
    name: 'Mụn ẩn, mụn đầu trắng',
    categoryCode: 'SKIN_CONCERN',
    description: 'Mụn nhỏ li ti ẩn dưới da hoặc có đầu trắng không viêm',
  },
  {
    code: 'ENLARGED_PORES',
    name: 'Lỗ chân lông to',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Lỗ chân lông nhìn thấy rõ, đặc biệt là ở vùng chữ T và hai bên má',
  },
  {
    code: 'HYPERPIGMENTATION',
    name: 'Thâm sạm, đốm nâu',
    categoryCode: 'SKIN_CONCERN',
    description: 'Da có các vùng tối màu, đốm nâu hoặc sạm nám',
  },
  {
    code: 'MELASMA',
    name: 'Nám da mặt',
    categoryCode: 'SKIN_CONCERN',
    description: 'Các mảng sạm màu đối xứng ở hai bên gò má hoặc trán',
  },
  {
    code: 'FRECKLES',
    name: 'Tàn nhang',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Các nốt nhỏ li ti màu nâu sáng hoặc tối màu do tiếp xúc ánh nắng',
  },
  {
    code: 'POST_INFLAMMATORY_HYPERPIGMENTATION',
    name: 'Vết thâm đen, thâm nâu sau mụn',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Vết thâm tối màu để lại sau khi mụn lành hoặc sau khi da bị tổn thương',
  },
  {
    code: 'POST_INFLAMMATORY_ERYTHEMA',
    name: 'Vết thâm đỏ, hồng đỏ sau mụn',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Các đốm màu đỏ hoặc hồng rát còn lại ngay sau khi vừa hết mụn sưng',
  },
  {
    code: 'WRINKLES',
    name: 'Nếp nhăn rõ rệt',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Các nếp nhăn nhìn thấy rõ khi cười hoặc ở đuôi mắt, vùng trán',
  },
  {
    code: 'FINE_LINES',
    name: 'Rãnh nhăn nông, nếp nhăn mờ',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Các đường nhăn mờ li ti do da bị khô hoặc mới bắt đầu lão hóa',
  },
  {
    code: 'DULL_SKIN',
    name: 'Da xỉn màu, thiếu sức sống',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Làn da trông kém tươi sáng, nhợt nhạt và không có độ căng bóng',
  },
  {
    code: 'ROUGH_TEXTURE',
    name: 'Bề mặt da sần sùi, thô ráp',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Khi sờ tay lên mặt thấy kém mịn màng, có cảm giác sần sùi lợn cợn',
  },
  {
    code: 'DEHYDRATED_SKIN',
    name: 'Da khô căng, thiếu nước',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Da hay có cảm giác khô rát, căng tức dù đôi khi vẫn có đổ bóng dầu',
  },
  {
    code: 'REDNESS',
    name: 'Da hay bị ửng đỏ rát',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Vùng hai bên má hoặc mũi dễ bị đỏ, mẫn cảm khi ra nắng hoặc đổi mỹ phẩm',
  },
  {
    code: 'ROSACEA',
    name: 'Da mẩn đỏ nhạy cảm mạn tính',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Tình trạng da hay bị đỏ ửng kèm cảm giác nóng rát râm ran thường xuyên',
  },
  {
    code: 'BARRIER_DAMAGE',
    name: 'Hàng rào bảo vệ da bị tổn thương',
    categoryCode: 'SKIN_CONCERN',
    description:
      'Da cực kỳ nhạy cảm, dễ châm chích ngứa rát khi dùng hầu hết các sản phẩm',
  },
  {
    code: 'DARK_CIRCLES',
    name: 'Quầng thâm mắt',
    categoryCode: 'SKIN_CONCERN',
    description: 'Vùng da quanh mắt bị tối màu hoặc có quầng thâm rệt',
  },
  {
    code: 'EYE_BAGS',
    name: 'Bọng mắt',
    categoryCode: 'SKIN_CONCERN',
    description: 'Vùng da dưới mắt bị sưng phồng hoặc có bọng mỡ nhìn thấy rõ',
  },
  {
    code: 'UNEVEN_SKIN_TONE',
    name: 'Tông màu da không đều',
    categoryCode: 'SKIN_CONCERN',
    description: 'Các vùng da trên mặt có chỗ sáng, chỗ tối màu không đều nhau',
  },

  // SKIN_GOAL
  {
    code: 'ACNE_TREATMENT',
    name: 'Giảm mụn và ngăn ngừa mụn quay lại',
    categoryCode: 'SKIN_GOAL',
    description:
      'Làm dịu các nốt mụn hiện tại và giữ cho lỗ chân lông sạch thoáng',
  },
  {
    code: 'BRIGHTENING',
    name: 'Dưỡng sáng da rạng rỡ',
    categoryCode: 'SKIN_GOAL',
    description: 'Giúp làn da tươi tắn, sáng mịn và hồng hào hơn',
  },
  {
    code: 'ANTI_AGING',
    name: 'Ngăn ngừa lão hóa và nếp nhăn',
    categoryCode: 'SKIN_GOAL',
    description: 'Giữ cho làn da săn chắc, đàn hồi và làm mờ dấu hiệu tuổi tác',
  },
  {
    code: 'HYDRATION',
    name: 'Cấp ẩm sâu và duy trì độ ẩm',
    categoryCode: 'SKIN_GOAL',
    description: 'Bổ sung lượng nước cần thiết giúp da căng mọng mềm mại',
  },
  {
    code: 'OIL_CONTROL',
    name: 'Kiểm soát dầu nhờn, giảm bóng dầu',
    categoryCode: 'SKIN_GOAL',
    description:
      'Điều tiết lượng dầu thừa giúp bề mặt da thông thoáng suốt cả ngày',
  },
  {
    code: 'BARRIER_REPAIR',
    name: 'Phục hồi da yếu và làm dịu kích ứng',
    categoryCode: 'SKIN_GOAL',
    description:
      'Củng cố lớp màng bảo vệ da, giúp da khỏe mạnh và bớt nhạy cảm hơn',
  },
  {
    code: 'REDUCE_PIGMENTATION',
    name: 'Làm mờ thâm nám và đốm nâu',
    categoryCode: 'SKIN_GOAL',
    description: 'Cải thiện tình trạng sạm nám, tàn nhang và vết thâm tối màu',
  },
  {
    code: 'REDUCE_WRINKLES',
    name: 'Cải thiện rãnh nhăn và nếp nhăn',
    categoryCode: 'SKIN_GOAL',
    description: 'Làm mờ độ sâu của các nếp nhăn vùng mắt, trán và khóe miệng',
  },
  {
    code: 'REDUCE_REDNESS',
    name: 'Làm dịu tình trạng ửng đỏ rát',
    categoryCode: 'SKIN_GOAL',
    description: 'Giảm độ đỏ ửng và cảm giác nóng rát khó chịu trên bề mặt da',
  },
  {
    code: 'IMPROVE_SKIN_TEXTURE',
    name: 'Cải thiện bề mặt da sần sùi',
    categoryCode: 'SKIN_GOAL',
    description:
      'Giúp bề mặt da trở nên láng mịn, mượt mà và mềm mại khi chạm vào',
  },
  {
    code: 'EVEN_SKIN_TONE',
    name: 'Dưỡng da đều màu',
    categoryCode: 'SKIN_GOAL',
    description:
      'Cân bằng sắc tố giúp tổng thể khuôn mặt hài hòa và đều màu hơn',
  },
  {
    code: 'MINIMIZE_PORES',
    name: 'Thu nhỏ vẻ ngoài lỗ chân lông',
    categoryCode: 'SKIN_GOAL',
    description: 'Giúp lỗ chân lông trông nhỏ mịn hơn và bề mặt da săn chắc',
  },

  // ALLERGY
  {
    code: 'FRAGRANCE',
    name: 'Hương liệu (Fragrance/Parfum)',
    categoryCode: 'ALLERGY',
    description:
      'Da bị kích ứng, ngứa rát khi dùng sản phẩm có mùi hương bổ sung',
  },
  {
    code: 'ALCOHOL',
    name: 'Cồn khô (Alcohol Denat)',
    categoryCode: 'ALLERGY',
    description:
      'Da bị khô rát, châm chích khi tiếp xúc với cồn khô trong mỹ phẩm',
  },
  {
    code: 'ESSENTIAL_OIL',
    name: 'Tinh dầu thực vật (Essential Oils)',
    categoryCode: 'ALLERGY',
    description:
      'Nhạy cảm hoặc dị ứng với các loại tinh dầu chiết xuất từ thiên nhiên',
  },
  {
    code: 'LANOLIN',
    name: 'Mỡ cừu (Lanolin)',
    categoryCode: 'ALLERGY',
    description: 'Dị ứng hoặc nổi mụn khi sử dụng các chất dưỡng ẩm từ mỡ cừu',
  },
  {
    code: 'SALICYLIC_ACID',
    name: 'Salicylic Acid (BHA)',
    categoryCode: 'ALLERGY',
    description: 'Da bị kích ứng, bong tróc hoặc đỏ rát mạnh khi dùng BHA',
  },
  {
    code: 'BENZOYL_PEROXIDE',
    name: 'Benzoyl Peroxide',
    categoryCode: 'ALLERGY',
    description:
      'Phản ứng mẩn đỏ ngứa hoặc sưng rát khi dùng chất chấm mụn Benzoyl Peroxide',
  },
  {
    code: 'RETINOIDS',
    name: 'Retinoids (Retinol/Tretinoin...)',
    categoryCode: 'ALLERGY',
    description:
      'Da không dung nạp hoặc dị ứng nặng với các phái sinh vitamin A',
  },
  {
    code: 'VITAMIN_C',
    name: 'Vitamin C nguyên chất (L-AA...)',
    categoryCode: 'ALLERGY',
    description:
      'Da bị châm chích ngứa rát hoặc mẩn đỏ khi dùng các dẫn xuất Vitamin C',
  },
  {
    code: 'NIACINAMIDE',
    name: 'Niacinamide (Vitamin B3)',
    categoryCode: 'ALLERGY',
    description: 'Dễ bị ửng đỏ, rát hoặc châm chích khi dùng Vitamin B3',
  },

  // CONTRAINDICATION
  {
    code: 'PREGNANCY',
    name: 'Đang mang thai',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Phụ nữ đang trong thai kỳ (cần tránh các hoạt chất mạnh như Retinoids, BHA nồng độ cao)',
  },
  {
    code: 'BREASTFEEDING',
    name: 'Đang cho con bú',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Phụ nữ đang trong giai đoạn cho con bú (cần chọn sản phẩm an toàn cho mẹ và bé)',
  },
  {
    code: 'OPEN_WOUND',
    name: 'Da có vết thương hở, vết trầy xước',
    categoryCode: 'CONTRAINDICATION',
    description: 'Bề mặt da đang bị tổn thương hở, chảy máu hoặc chưa lành hẳn',
  },
  {
    code: 'ACTIVE_SKIN_INFECTION',
    name: 'Da đang bị viêm nhiễm hoặc mụn nước',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Tình trạng nhiễm trùng da do vi khuẩn, nấm hoặc virus đang hoạt động',
  },
  {
    code: 'RECENT_CHEMICAL_PEEL',
    name: 'Vừa lột da sinh học (Peel da mạnh)',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Mới thực hiện peel da bằng acid nồng độ cao trong vòng vài ngày qua',
  },
  {
    code: 'RECENT_LASER_TREATMENT',
    name: 'Vừa điều trị Laser/Lăn kim',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Mới can thiệp thẩm mỹ công nghệ cao trên da cần thời gian phục hồi',
  },
  {
    code: 'RECENT_MICRONEEDLING',
    name: 'Vừa phi kim hoặc lăn kim',
    categoryCode: 'CONTRAINDICATION',
    description:
      'Mới thực hiện liệu pháp vi kim đang trong giai đoạn phục hồi màng bảo vệ',
  },

  // AGE_GROUP
  {
    code: 'UNDER_18',
    name: 'Dưới 18 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Khách hàng ở độ tuổi học sinh, thanh thiếu niên dưới 18 tuổi',
  },
  {
    code: 'AGE_18_25',
    name: 'Từ 18 đến 25 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Độ tuổi thanh niên từ 18 đến 25 tuổi',
  },
  {
    code: 'AGE_26_35',
    name: 'Từ 26 đến 35 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Độ tuổi trưởng thành từ 26 đến 35 tuổi',
  },
  {
    code: 'AGE_36_45',
    name: 'Từ 36 đến 45 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Độ tuổi từ 36 đến 45 tuổi',
  },
  {
    code: 'AGE_46_60',
    name: 'Từ 46 đến 60 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Độ tuổi trung niên từ 46 đến 60 tuổi',
  },
  {
    code: 'ABOVE_60',
    name: 'Trên 60 tuổi',
    categoryCode: 'AGE_GROUP',
    description: 'Khách hàng lớn tuổi trên 60 tuổi',
  },

  // GENDER
  {
    code: 'MALE',
    name: 'Nam',
    categoryCode: 'GENDER',
    description: 'Giới tính nam',
  },
  {
    code: 'FEMALE',
    name: 'Nữ',
    categoryCode: 'GENDER',
    description: 'Giới tính nữ',
  },
  {
    code: 'NOT_PREFER_TO_SAY',
    name: 'Không muốn tiết lộ',
    categoryCode: 'GENDER',
    description: 'Khách hàng ưu tiên không chia sẻ giới tính',
  },

  // LIFESTYLE
  {
    code: 'OUTDOOR_LIFESTYLE',
    name: 'Thường xuyên hoạt động ngoài trời',
    categoryCode: 'LIFESTYLE',
    description:
      'Hay phải di chuyển, làm việc ngoài trời hoặc tiếp xúc nhiều với nắng gió',
  },
  {
    code: 'INDOOR_LIFESTYLE',
    name: 'Chủ yếu làm việc trong nhà/văn phòng',
    categoryCode: 'LIFESTYLE',
    description:
      'Sinh hoạt chủ yếu trong không gian trong nhà, ít tiếp xúc trực tiếp với nắng',
  },
  {
    code: 'NIGHT_SHIFT',
    name: 'Thức khuya hoặc làm ca đêm',
    categoryCode: 'LIFESTYLE',
    description:
      'Thói quen ngủ trễ hoặc nhịp sinh học thay đổi do tính chất công việc',
  },
  {
    code: 'HIGH_SUN_EXPOSURE',
    name: 'Tiếp xúc nhiều với ánh nắng trực tiếp',
    categoryCode: 'LIFESTYLE',
    description: 'Da tiếp xúc với tia UV thường xuyên trong ngày',
  },
  {
    code: 'HEAVY_MAKEUP',
    name: 'Trang điểm đậm, dùng kem nền hàng ngày',
    categoryCode: 'LIFESTYLE',
    description:
      'Thói quen trang điểm thường xuyên hoặc dùng lớp nền lâu trôi mỗi ngày',
  },
  {
    code: 'FREQUENT_EXERCISE',
    name: 'Tập thể thao thường xuyên ra nhiều mồ hôi',
    categoryCode: 'LIFESTYLE',
    description:
      'Hay tập luyện thể dục thể thao, bơi lội hoặc vận động đổ nhiều mồ hôi',
  },
  {
    code: 'AIR_CONDITIONED_ENVIRONMENT',
    name: 'Ngồi điều hòa/máy lạnh liên tục',
    categoryCode: 'LIFESTYLE',
    description:
      'Làm việc hoặc sinh hoạt trong môi trường máy lạnh khô hanh suốt nhiều giờ',
  },
  {
    code: 'SMOKING',
    name: 'Có hút thuốc lá hoặc tiếp xúc khói thuốc',
    categoryCode: 'LIFESTYLE',
    description:
      'Thói quen hút thuốc hoặc hay ở trong môi trường có khói thuốc lá',
  },
  {
    code: 'HIGH_STRESS',
    name: 'Thường xuyên căng thẳng, áp lực cao',
    categoryCode: 'LIFESTYLE',
    description:
      'Đang trong giai đoạn nhiều stress, lo lắng hay mệt mỏi kéo dài',
  },

  // EXPERIENCE_LEVEL
  {
    code: 'BEGINNER',
    name: 'Người mới bắt đầu (Chưa dùng active bao giờ)',
    categoryCode: 'EXPERIENCE_LEVEL',
    description:
      'Mới bắt đầu chăm sóc da cơ bản, chưa quen hoặc chưa từng dùng Retinol, AHA/BHA',
  },
  {
    code: 'INTERMEDIATE',
    name: 'Đã có kinh nghiệm cơ bản',
    categoryCode: 'EXPERIENCE_LEVEL',
    description:
      'Đã quen với việc sử dụng các hoạt chất tẩy da chết hóa học hoặc làm sáng da ở nồng độ vừa phải',
  },
  {
    code: 'ADVANCED',
    name: 'Đã rất quen thuộc và thành thạo',
    categoryCode: 'EXPERIENCE_LEVEL',
    description:
      'Đã từng sử dụng tốt các hoạt chất mạnh (Retinol nồng độ cao, BHA/AHA chuyên sâu) và biết lắng nghe da',
  },

  // PRODUCT_PREFERENCE
  {
    code: 'FRAGRANCE_FREE',
    name: 'Không chứa hương liệu',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Ưu tiên sản phẩm không có hương liệu nhân tạo hoặc mùi thơm',
  },
  {
    code: 'ALCOHOL_FREE',
    name: 'Không chứa cồn khô',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Ưu tiên sản phẩm không có cồn khô (Alcohol Denat/Ethanol)',
  },
  {
    code: 'ESSENTIAL_OIL_FREE',
    name: 'Không chứa tinh dầu',
    categoryCode: 'PRODUCT_PREFERENCE',
    description: 'Ưu tiên công thức không có tinh dầu thực vật dễ gây kích ứng',
  },
  {
    code: 'NON_COMEDOGENIC',
    name: 'Không gây bít tắc lỗ chân lông',
    categoryCode: 'PRODUCT_PREFERENCE',
    description:
      'Ưu tiên sản phẩm có kết cấu thoáng nhẹ, được chứng minh không làm bít lỗ chân lông',
  },
  {
    code: 'HYPOALLERGENIC',
    name: 'Công thức ít gây kích ứng',
    categoryCode: 'PRODUCT_PREFERENCE',
    description:
      'Ưu tiên mỹ phẩm dịu nhẹ đã được kiểm tra an toàn cho da nhạy cảm',
  },
  {
    code: 'DERMATOLOGIST_TESTED',
    name: 'Được kiểm nghiệm bởi bác sĩ da liễu',
    categoryCode: 'PRODUCT_PREFERENCE',
    description:
      'Ưu tiên sản phẩm đã được các chuyên gia da liễu đánh giá và khuyên dùng',
  },
  {
    code: 'VEGAN',
    name: 'Thuần chay (Vegan)',
    categoryCode: 'PRODUCT_PREFERENCE',
    description:
      'Ưu tiên sản phẩm không chứa bất kỳ thành phần nào có nguồn gốc từ động vật',
  },
  {
    code: 'CRUELTY_FREE',
    name: 'Không thử nghiệm trên động vật (Cruelty-Free)',
    categoryCode: 'PRODUCT_PREFERENCE',
    description:
      'Ưu tiên các thương hiệu cam kết không thử nghiệm trên động vật',
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

/** Maps product SKU → protocol codes for recommendation seeding. */
const PRODUCT_PROTOCOL_MAPPINGS: Array<{
  sku: string;
  protocolCode: string;
}> = [
  { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'ceramide_barrier' },
  { sku: 'CERAVE-FOAM-CLEANSER-236ML', protocolCode: 'niacinamide_general' },
  { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'glycolic_exfoliation' },
  { sku: 'SOMEBYMI-MIRACLE-TONER-150ML', protocolCode: 'salicylic_acne' },
  { sku: 'TO-NIACINAMIDE-10-ZINC-30ML', protocolCode: 'niacinamide_general' },
  { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ceramide_barrier' },
  { sku: 'CERAVE-MOIST-CREAM-454G', protocolCode: 'ha_hydration' },
  { sku: 'LRP-ANTHELIOS-UVMUNE-50ML', protocolCode: 'ha_hydration' },
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
