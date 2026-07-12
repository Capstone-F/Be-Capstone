import { Injectable } from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import {
  LlmRoutineProvider,
  RoutineGenerationInput,
  RoutineGenerationOutput,
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
        target.push({
          name: product.productName,
          period,
          stepOrder: target.length + 1,
          instructions:
            product.instructions?.trim() ||
            `Apply ${product.productName} as directed for ${product.protocolName ?? 'your skin concerns'}.`,
          productVariantId: product.productVariantId,
          protocolId: product.protocolId,
          amountMl: null,
        });
      }
    }

    if (morning.length === 0 && evening.length === 0) {
      input.products.forEach((product, index) => {
        evening.push({
          name: product.productName,
          period: RoutinePeriod.EVENING,
          stepOrder: index + 1,
          instructions: `Use ${product.productName} in your evening routine.`,
          productVariantId: product.productVariantId,
          protocolId: product.protocolId,
          amountMl: null,
        });
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
