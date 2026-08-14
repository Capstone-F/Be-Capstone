/**
 * Shared step-role heuristics and default dosage / wait time.
 *
 * Used by both routine builders so AI-generated (customer) and
 * rule-engine-generated (expert) routines stay consistent:
 * - MockLlmRoutineProvider  → customer routine from a survey order
 * - TreatmentsService.generateRoutine → expert routine from phase products
 */

export type RoutineStepRole =
  'CLEANSER' | 'TONER' | 'SERUM' | 'TREATMENT' | 'MOISTURIZER' | 'SUNSCREEN';

/** Ordering of steps within a period (lower runs first). */
export const CATEGORY_STEP_RANK: Record<RoutineStepRole, number> = {
  CLEANSER: 10,
  TONER: 20,
  SERUM: 30,
  TREATMENT: 40,
  MOISTURIZER: 50,
  SUNSCREEN: 60,
};

/** Rank used when the role cannot be resolved from category/protocol/name. */
export const DEFAULT_CATEGORY_RANK = 35;

export interface RoutineStepRoleInput {
  productName?: string | null;
  categoryCode?: string | null;
  protocolCode?: string | null;
  protocolName?: string | null;
}

export interface RoutineStepDosageDefault {
  amountMl: number;
  dosageText: string;
}

/**
 * Ordered name heuristics, checked when neither category nor protocol code
 * resolves the role. Vietnamese first — experts name hand-added steps in VI,
 * and "kem chống nắng" must land on SUNSCREEN before "kem dưỡng" reasoning.
 */
const NAME_KEYWORDS: Array<[RoutineStepRole, string[]]> = [
  ['SUNSCREEN', ['chống nắng', 'sunscreen', 'spf']],
  ['CLEANSER', ['rửa mặt', 'làm sạch', 'tẩy trang', 'cleanse']],
  ['TONER', ['toner', 'nước hoa hồng', 'cân bằng', 'essence']],
  ['TREATMENT', ['đặc trị', 'trị mụn', 'treatment', 'acne']],
  ['MOISTURIZER', ['dưỡng ẩm', 'kem dưỡng', 'moistur', 'cream']],
  ['SERUM', ['serum', 'tinh chất', 'huyết thanh']],
];

function isRoutineStepRole(value: string): value is RoutineStepRole {
  return value in CATEGORY_STEP_RANK;
}

/**
 * Prefer product category, then protocol code prefix, then name heuristics.
 */
export function resolveRoutineStepRole(
  input: RoutineStepRoleInput,
): RoutineStepRole {
  const category = (input.categoryCode ?? '').toUpperCase();
  if (category && isRoutineStepRole(category)) {
    return category;
  }

  const code = (input.protocolCode ?? '').toLowerCase();
  if (code.startsWith('cleanser_') || code.includes('cleanse')) {
    return 'CLEANSER';
  }
  if (code.startsWith('toner_') || code.includes('toner')) {
    return 'TONER';
  }
  if (code.startsWith('serum_')) {
    return 'SERUM';
  }
  if (code.startsWith('moisturizer_') || code.includes('moistur')) {
    return 'MOISTURIZER';
  }
  if (
    code.startsWith('sunscreen_') ||
    code.includes('sunscreen') ||
    code.includes('spf')
  ) {
    return 'SUNSCREEN';
  }
  if (code.startsWith('treatment_') || code.includes('benzoyl')) {
    return 'TREATMENT';
  }

  const name = (input.protocolName ?? input.productName ?? '').toLowerCase();
  for (const [role, keywords] of NAME_KEYWORDS) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return role;
    }
  }
  return 'SERUM';
}

/** Sort key for steps within a period (CLEANSER → … → SUNSCREEN). */
export function resolveRoutineStepRank(input: RoutineStepRoleInput): number {
  return (
    CATEGORY_STEP_RANK[resolveRoutineStepRole(input)] ?? DEFAULT_CATEGORY_RANK
  );
}

/** Default per-application dosage, in ml plus Vietnamese copy. */
export function resolveDefaultDosage(
  input: RoutineStepRoleInput,
): RoutineStepDosageDefault {
  switch (resolveRoutineStepRole(input)) {
    case 'CLEANSER':
      return { amountMl: 2, dosageText: 'bằng hạt đậu' };
    case 'TONER':
      return { amountMl: 3, dosageText: '2-3 giọt / bông cotton' };
    case 'SERUM':
      return { amountMl: 2, dosageText: '2-3 giọt' };
    case 'TREATMENT':
      return { amountMl: 1, dosageText: 'lớp mỏng' };
    case 'MOISTURIZER':
      return { amountMl: 2, dosageText: 'bằng hạt đậu' };
    case 'SUNSCREEN':
      return { amountMl: 2, dosageText: 'hai đốt ngón tay' };
    default:
      return { amountMl: 2, dosageText: '2 giọt' };
  }
}

/**
 * Vietnamese step copy for a product. The app is Vietnamese-first, so builders
 * always emit VI instructions instead of passing through EN catalog HDSD.
 */
export function resolveDefaultInstructions(
  input: RoutineStepRoleInput,
): string {
  const productName = input.productName ?? 'sản phẩm';
  switch (resolveRoutineStepRole(input)) {
    case 'CLEANSER':
      return `Làm ướt mặt, lấy một lượng ${productName} bằng hạt đậu tạo bọt, massage 30-60 giây, rửa sạch và thấm khô.`;
    case 'TONER':
      return `Sau khi làm sạch, thoa ${productName} bằng tay hoặc bông cotton. Tránh vùng mắt và chờ trước bước tiếp theo.`;
    case 'SERUM':
      return `Sử dụng 2-3 giọt ${productName} lên da sạch và vỗ nhẹ đến khi thấm.`;
    case 'TREATMENT':
      return `Thoa một lớp mỏng ${productName} lên vùng cần điều trị. Dưỡng ẩm sau nếu da khô.`;
    case 'MOISTURIZER':
      return `Massage một lượng ${productName} bằng hạt đậu lên mặt và cổ đến khi thấm.`;
    case 'SUNSCREEN':
      return `Ở bước buổi sáng cuối cùng, thoa đều ${productName} lượng bằng hai đốt ngón tay. Thoa lại nếu ra ngoài trời.`;
    default:
      return `Sử dụng ${productName} theo hướng dẫn phù hợp với ${input.protocolName ?? 'nhu cầu da của bạn'}.`;
  }
}

/** Minutes to wait after this step before the next product. */
export function resolveDefaultWaitMinutes(
  input: RoutineStepRoleInput,
  isFirstInPeriod: boolean,
): number {
  if (isFirstInPeriod) {
    return 0;
  }
  const role = resolveRoutineStepRole(input);
  if (role === 'TONER' || role === 'SERUM' || role === 'TREATMENT') {
    return 5;
  }
  if (role === 'MOISTURIZER') {
    return 2;
  }
  return 0;
}
