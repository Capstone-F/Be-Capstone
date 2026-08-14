import { Injectable } from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import {
  resolveDefaultDosage,
  resolveDefaultInstructions,
  resolveDefaultWaitMinutes,
  resolveRoutineStepRank,
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
      instructions: resolveDefaultInstructions(product),
      productVariantId: product.productVariantId,
      protocolId: product.protocolId,
      amountMl: dosage.amountMl,
      dosageText: dosage.dosageText,
      waitMinutes: resolveDefaultWaitMinutes(product, stepOrder === 1),
    };
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
