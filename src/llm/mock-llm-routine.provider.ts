import { Injectable } from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import {
  LlmRoutineProvider,
  RoutineGenerationInput,
  RoutineGenerationOutput,
  RoutineGenerationProductInput,
  RoutineGenerationStepOutput,
} from './llm-routine.types';

const CATEGORY_STEP_RANK: Record<string, number> = {
  CLEANSER: 10,
  TONER: 20,
  SERUM: 30,
  TREATMENT: 40,
  MOISTURIZER: 50,
  SUNSCREEN: 60,
};

/**
 * Deterministic mock provider for development and tests.
 * Builds ordered morning/evening steps from purchased products using
 * protocol timeOfUse and category heuristics. Step copy is Vietnamese-first.
 */
@Injectable()
export class MockLlmRoutineProvider implements LlmRoutineProvider {
  generateRoutine(
    input: RoutineGenerationInput,
  ): Promise<RoutineGenerationOutput> {
    const morning: RoutineGenerationStepOutput[] = [];
    const evening: RoutineGenerationStepOutput[] = [];

    const orderedProducts = [...input.products].sort((a, b) => {
      const byCat =
        this.categoryRank(a) - this.categoryRank(b) ||
        a.productName.localeCompare(b.productName);
      return byCat;
    });

    for (const product of orderedProducts) {
      const periods = this.resolvePeriods(product.timeOfUse);
      for (const period of periods) {
        const target = period === RoutinePeriod.MORNING ? morning : evening;
        target.push(this.buildStep(product, period, target.length + 1));
      }
    }

    if (morning.length === 0 && evening.length === 0) {
      orderedProducts.forEach((product, index) => {
        evening.push(this.buildStep(product, RoutinePeriod.EVENING, index + 1));
      });
    }

    // Re-number after category sort within each period (already inserted in order)
    this.renumber(morning);
    this.renumber(evening);

    const skinHint = input.customerProfile.skinTypeCode
      ? ` cho da ${input.customerProfile.skinTypeCode}`
      : '';
    const concernHint = this.concernHint(input.labelCodes);

    return Promise.resolve({
      title: `Quy trình chăm sóc da cá nhân hóa${skinHint}`,
      description:
        `Quy trình mẫu dựa trên sản phẩm bạn đã mua từ khảo sát` +
        (concernHint ? ` (tập trung: ${concernHint})` : '') +
        '. Hướng dẫn từng bước bằng tiếng Việt.',
      steps: [...morning, ...evening],
    });
  }

  private renumber(steps: RoutineGenerationStepOutput[]): void {
    steps.forEach((step, index) => {
      step.stepOrder = index + 1;
      if (step.waitMinutes === null || step.waitMinutes === undefined) {
        return;
      }
      // First step in a period should not force a wait
      if (index === 0) {
        step.waitMinutes = 0;
      }
    });
  }

  private buildStep(
    product: RoutineGenerationProductInput,
    period: RoutinePeriod,
    stepOrder: number,
  ): RoutineGenerationStepOutput {
    const dosage = this.resolveDosage(product);
    return {
      name: product.productName,
      period,
      stepOrder,
      instructions: this.resolveInstructions(product),
      productVariantId: product.productVariantId,
      protocolId: product.protocolId,
      amountMl: dosage.amountMl,
      dosageText: dosage.dosageText,
      waitMinutes: this.resolveWaitMinutes(product, stepOrder),
    };
  }

  private resolveInstructions(product: RoutineGenerationProductInput): string {
    // App is Vietnamese-first: always emit VI step copy (do not pass through EN seed HDSD).
    const role = this.resolveRole(product);
    const fallbacks: Record<string, string> = {
      CLEANSER: `Làm ướt mặt, lấy một lượng ${product.productName} bằng hạt đậu tạo bọt, massage 30-60 giây, rửa sạch và thấm khô.`,
      TONER: `Sau khi làm sạch, thoa ${product.productName} bằng tay hoặc bông cotton. Tránh vùng mắt và chờ trước bước tiếp theo.`,
      SERUM: `Sử dụng 2-3 giọt ${product.productName} lên da sạch và vỗ nhẹ đến khi thấm.`,
      TREATMENT: `Thoa một lớp mỏng ${product.productName} lên vùng cần điều trị. Dưỡng ẩm sau nếu da khô.`,
      MOISTURIZER: `Massage một lượng ${product.productName} bằng hạt đậu lên mặt và cổ đến khi thấm.`,
      SUNSCREEN: `Ở bước buổi sáng cuối cùng, thoa đều ${product.productName} lượng bằng hai đốt ngón tay. Thoa lại nếu ra ngoài trời.`,
    };
    return (
      fallbacks[role] ??
      `Sử dụng ${product.productName} theo hướng dẫn phù hợp với ${product.protocolName ?? 'nhu cầu da của bạn'}.`
    );
  }

  private resolveDosage(product: RoutineGenerationProductInput): {
    amountMl: number;
    dosageText: string;
  } {
    const role = this.resolveRole(product);
    switch (role) {
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

  private resolveWaitMinutes(
    product: RoutineGenerationProductInput,
    stepOrder: number,
  ): number {
    if (stepOrder === 1) {
      return 0;
    }
    const role = this.resolveRole(product);
    if (role === 'CLEANSER') {
      return 0;
    }
    if (role === 'TONER' || role === 'SERUM' || role === 'TREATMENT') {
      return 5;
    }
    if (role === 'MOISTURIZER') {
      return 2;
    }
    return 0;
  }

  /**
   * Prefer product category, then protocol code prefix, then name heuristics.
   */
  private resolveRole(product: RoutineGenerationProductInput): string {
    const category = (product.categoryCode ?? '').toUpperCase();
    if (category && CATEGORY_STEP_RANK[category] !== undefined) {
      return category;
    }

    const code = (product.protocolCode ?? '').toLowerCase();
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

    const name = (
      product.protocolName ??
      product.productName ??
      ''
    ).toLowerCase();
    if (name.includes('cleanse')) return 'CLEANSER';
    if (name.includes('toner') || name.includes('essence')) return 'TONER';
    if (name.includes('sunscreen') || name.includes('spf')) return 'SUNSCREEN';
    if (name.includes('moistur') || name.includes('cream'))
      return 'MOISTURIZER';
    if (name.includes('treatment') || name.includes('acne')) return 'TREATMENT';
    if (name.includes('serum')) return 'SERUM';
    return 'SERUM';
  }

  private categoryRank(product: RoutineGenerationProductInput): number {
    const role = this.resolveRole(product);
    return CATEGORY_STEP_RANK[role] ?? 35;
  }

  private concernHint(labelCodes: string[]): string | null {
    const preferred = [
      'ACNE_TREATMENT',
      'BARRIER_REPAIR',
      'HYDRATION',
      'ANTI_AGING',
      'REDUCE_PIGMENTATION',
      'OIL_CONTROL',
    ];
    for (const code of preferred) {
      if (labelCodes.includes(code)) {
        return code.toLowerCase().replace(/_/g, ' ');
      }
    }
    return labelCodes[0]?.toLowerCase().replace(/_/g, ' ') ?? null;
  }

  private resolvePeriods(timeOfUse: TimeOfUse | null): RoutinePeriod[] {
    switch (timeOfUse) {
      case TimeOfUse.AM:
        return [RoutinePeriod.MORNING];
      case TimeOfUse.PM:
        return [RoutinePeriod.EVENING];
      case TimeOfUse.AM_PM:
        return [RoutinePeriod.MORNING, RoutinePeriod.EVENING];
      default:
        return [RoutinePeriod.EVENING];
    }
  }
}
