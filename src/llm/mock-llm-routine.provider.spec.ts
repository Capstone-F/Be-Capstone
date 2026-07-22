import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import { MockLlmRoutineProvider } from './mock-llm-routine.provider';

describe('MockLlmRoutineProvider', () => {
  const provider = new MockLlmRoutineProvider();

  it('splits AM_PM products into morning and evening steps', async () => {
    const result = await provider.generateRoutine({
      customerProfile: {
        age: 28,
        gender: 'FEMALE',
        skinTypeCode: 'OSPW',
      },
      labelCodes: ['ACNE_TREATMENT'],
      products: [
        {
          productVariantId: 'v1',
          productName: 'Niacinamide Serum',
          sku: 'SKU-1',
          protocolId: 'p1',
          protocolCode: 'niacinamide_general',
          protocolName: 'Niacinamide',
          timeOfUse: TimeOfUse.AM_PM,
          instructions: 'Apply gently',
        },
      ],
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.period).sort()).toEqual([
      RoutinePeriod.EVENING,
      RoutinePeriod.MORNING,
    ]);
    expect(result.title).toContain('OSPW');
    for (const step of result.steps) {
      expect(step.amountMl).toBe(2);
      expect(step.dosageText).toBe('2 drops');
      expect(typeof step.waitMinutes).toBe('number');
    }
    const morning = result.steps.find(
      (s) => s.period === RoutinePeriod.MORNING,
    );
    expect(morning?.waitMinutes).toBe(0);
  });

  it('uses cleanser-friendly dosage and wait heuristics', async () => {
    const result = await provider.generateRoutine({
      customerProfile: { age: 30, gender: 'FEMALE', skinTypeCode: null },
      labelCodes: [],
      products: [
        {
          productVariantId: 'v-cleanse',
          productName: 'Gentle Cleanser',
          sku: 'SKU-C',
          protocolId: 'p-c',
          protocolCode: 'cleanser_gentle',
          protocolName: 'Cleanser',
          timeOfUse: TimeOfUse.AM,
          instructions: null,
        },
        {
          productVariantId: 'v-serum',
          productName: 'Serum',
          sku: 'SKU-S',
          protocolId: 'p-s',
          protocolCode: 'niacinamide_general',
          protocolName: 'Niacinamide',
          timeOfUse: TimeOfUse.AM,
          instructions: null,
        },
      ],
    });

    const cleanser = result.steps.find(
      (s) => s.productVariantId === 'v-cleanse',
    );
    const serum = result.steps.find((s) => s.productVariantId === 'v-serum');
    expect(cleanser?.dosageText).toBe('pea-sized');
    expect(cleanser?.waitMinutes).toBe(0);
    expect(serum?.dosageText).toBe('2 drops');
    expect(serum?.waitMinutes).toBe(5);
  });
});
