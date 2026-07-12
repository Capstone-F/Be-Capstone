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
  });
});
