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
          categoryCode: 'SERUM',
          protocolId: 'p1',
          protocolCode: 'serum_niacinamide',
          protocolName: 'Niacinamide Treatment Serum',
          timeOfUse: TimeOfUse.AM_PM,
          instructions:
            'Apply 2–3 drops to clean, dry face. Gently pat until absorbed.',
        },
      ],
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.period).sort()).toEqual([
      RoutinePeriod.EVENING,
      RoutinePeriod.MORNING,
    ]);
    expect(result.title).toContain('OSPW');
    expect(result.title).toContain('Quy trình chăm sóc da');
    expect(result.description).toContain('tiếng Việt');
    expect(result.description).toContain('giảm mụn');
    for (const step of result.steps) {
      expect(step.amountMl).toBe(2);
      expect(step.dosageText).toBe('2-3 giọt');
      expect(step.instructions).toContain('2-3 giọt');
      expect(step.instructions).toContain('Niacinamide Serum');
      expect(typeof step.waitMinutes).toBe('number');
    }
    const morning = result.steps.find(
      (s) => s.period === RoutinePeriod.MORNING,
    );
    expect(morning?.waitMinutes).toBe(0);
  });

  it('orders by category and uses Vietnamese cleanser/sunscreen detail', async () => {
    const result = await provider.generateRoutine({
      customerProfile: { age: 30, gender: 'FEMALE', skinTypeCode: null },
      labelCodes: ['HIGH_SUN_EXPOSURE'],
      products: [
        {
          productVariantId: 'v-spf',
          productName: 'Anthelios SPF50+',
          sku: 'SKU-SPF',
          categoryCode: 'SUNSCREEN',
          protocolId: 'p-spf',
          protocolCode: 'sunscreen_daily_spf',
          protocolName: 'Daily Broad-Spectrum Sunscreen',
          timeOfUse: TimeOfUse.AM,
          instructions:
            'As the final morning step, apply two finger-lengths evenly.',
        },
        {
          productVariantId: 'v-cleanse',
          productName: 'Gentle Cleanser',
          sku: 'SKU-C',
          categoryCode: 'CLEANSER',
          protocolId: 'p-c',
          protocolCode: 'cleanser_gentle_foam',
          protocolName: 'Gentle Foaming Cleanser',
          timeOfUse: TimeOfUse.AM,
          instructions:
            'Wet face, dispense a pea-sized amount, lather, and massage 30–60 seconds.',
        },
        {
          productVariantId: 'v-serum',
          productName: 'Serum',
          sku: 'SKU-S',
          categoryCode: 'SERUM',
          protocolId: 'p-s',
          protocolCode: 'serum_niacinamide',
          protocolName: 'Niacinamide',
          timeOfUse: TimeOfUse.AM,
          instructions: null,
        },
      ],
    });

    const morning = result.steps.filter(
      (s) => s.period === RoutinePeriod.MORNING,
    );
    expect(morning.map((s) => s.productVariantId)).toEqual([
      'v-cleanse',
      'v-serum',
      'v-spf',
    ]);

    const cleanser = morning[0];
    const serum = morning[1];
    const spf = morning[2];
    expect(cleanser.dosageText).toBe('bằng hạt đậu');
    expect(cleanser.waitMinutes).toBe(0);
    expect(cleanser.instructions).toContain('bằng hạt đậu');
    expect(serum.dosageText).toBe('2-3 giọt');
    expect(serum.waitMinutes).toBe(5);
    expect(spf.dosageText).toBe('hai đốt ngón tay');
    expect(spf.instructions).toContain('hai đốt ngón tay');
  });
});
