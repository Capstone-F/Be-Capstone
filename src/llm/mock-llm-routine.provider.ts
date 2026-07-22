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

/**
 * Deterministic mock provider for development and tests.
 * Builds morning/evening steps from purchased products using protocol timeOfUse.
 */
@Injectable()
export class MockLlmRoutineProvider implements LlmRoutineProvider {
  generateRoutine(
    input: RoutineGenerationInput,
  ): Promise<RoutineGenerationOutput> {
    const morning: RoutineGenerationStepOutput[] = [];
    const evening: RoutineGenerationStepOutput[] = [];

    for (const product of input.products) {
      const periods = this.resolvePeriods(product.timeOfUse);
      for (const period of periods) {
        const target = period === RoutinePeriod.MORNING ? morning : evening;
        target.push(this.buildStep(product, period, target.length + 1));
      }
    }

    if (morning.length === 0 && evening.length === 0) {
      input.products.forEach((product, index) => {
        evening.push(this.buildStep(product, RoutinePeriod.EVENING, index + 1));
      });
    }

    const skinHint = input.customerProfile.skinTypeCode
      ? ` for ${input.customerProfile.skinTypeCode} skin`
      : '';

    return Promise.resolve({
      title: `Personalized routine${skinHint}`,
      description:
        'AI-recommended routine based on your purchased survey products.',
      steps: [...morning, ...evening],
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
      instructions:
        product.instructions?.trim() ||
        `Apply ${product.productName} as directed for ${product.protocolName ?? 'your skin concerns'}.`,
      productVariantId: product.productVariantId,
      protocolId: product.protocolId,
      amountMl: dosage.amountMl,
      dosageText: dosage.dosageText,
      waitMinutes: this.resolveWaitMinutes(product, stepOrder),
    };
  }

  private resolveDosage(product: RoutineGenerationProductInput): {
    amountMl: number;
    dosageText: string;
  } {
    const code = (product.protocolCode ?? '').toLowerCase();
    const name = (
      product.protocolName ??
      product.productName ??
      ''
    ).toLowerCase();

    if (code.includes('cleanse') || name.includes('cleanse')) {
      return { amountMl: 2, dosageText: 'pea-sized' };
    }
    if (
      code.includes('sunscreen') ||
      name.includes('sunscreen') ||
      name.includes('spf')
    ) {
      return { amountMl: 2, dosageText: 'two finger-lengths' };
    }
    if (
      code.includes('moistur') ||
      name.includes('moistur') ||
      name.includes('cream')
    ) {
      return { amountMl: 2, dosageText: 'pea-sized' };
    }
    if (
      code.includes('toner') ||
      name.includes('toner') ||
      name.includes('essence')
    ) {
      return { amountMl: 3, dosageText: '2–3 drops' };
    }
    // Default for serums / actives / unknown
    return { amountMl: 2, dosageText: '2 drops' };
  }

  private resolveWaitMinutes(
    product: RoutineGenerationProductInput,
    stepOrder: number,
  ): number {
    if (stepOrder === 1) {
      return 0;
    }
    const code = (product.protocolCode ?? '').toLowerCase();
    const name = (
      product.protocolName ??
      product.productName ??
      ''
    ).toLowerCase();
    if (code.includes('cleanse') || name.includes('cleanse')) {
      return 0;
    }
    return 5;
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
