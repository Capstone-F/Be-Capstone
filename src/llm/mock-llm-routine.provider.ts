import { Injectable } from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import {
  resolveDefaultDosage,
  resolveDefaultWaitMinutes,
  resolveRoutineStepRank,
  resolveRoutineStepRole,
} from '../routines/routine-step-defaults';
import {
  LlmRoutineProvider,
  RoutineGenerationInput,
  RoutineGenerationOutput,
  RoutineGenerationProductInput,
  RoutineGenerationStepOutput,
} from './llm-routine.types';

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
    const dosage = resolveDefaultDosage(product);
    return {
      name: product.productName,
      period,
      stepOrder,
      instructions: this.resolveInstructions(product),
      productVariantId: product.productVariantId,
      protocolId: product.protocolId,
      amountMl: dosage.amountMl,
      dosageText: dosage.dosageText,
      waitMinutes: resolveDefaultWaitMinutes(product, stepOrder === 1),
    };
  }

  private resolveInstructions(product: RoutineGenerationProductInput): string {
    // App is Vietnamese-first: always emit VI step copy (do not pass through EN seed HDSD).
    const role = resolveRoutineStepRole(product);
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

  private categoryRank(product: RoutineGenerationProductInput): number {
    return resolveRoutineStepRank(product);
  }

  private concernHint(labelCodes: string[]): string | null {
    const preferredVi: Record<string, string> = {
      ACNE_TREATMENT: 'giảm mụn',
      BARRIER_REPAIR: 'phục hồi hàng rào da',
      HYDRATION: 'cấp ẩm',
      ANTI_AGING: 'chống lão hóa',
      REDUCE_PIGMENTATION: 'làm mờ thâm nám',
      OIL_CONTROL: 'kiểm soát dầu',
    };
    for (const code of Object.keys(preferredVi)) {
      if (labelCodes.includes(code)) {
        return preferredVi[code];
      }
    }
    const first = labelCodes[0];
    if (!first) return null;
    return preferredVi[first] ?? first.toLowerCase().replace(/_/g, ' ');
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
