import {
  resolveDefaultDosage,
  resolveDefaultWaitMinutes,
  resolveRoutineStepRank,
  resolveRoutineStepRole,
} from './routine-step-defaults';

describe('routine step defaults', () => {
  it('prefers category code over protocol code and name', () => {
    expect(
      resolveRoutineStepRole({
        categoryCode: 'sunscreen',
        protocolCode: 'serum_niacinamide',
        productName: 'Gentle Cleanser',
      }),
    ).toBe('SUNSCREEN');
  });

  it('falls back to protocol code, then to name', () => {
    expect(
      resolveRoutineStepRole({
        protocolCode: 'cleanser_gentle_foam',
        productName: 'Serum X',
      }),
    ).toBe('CLEANSER');
    expect(resolveRoutineStepRole({ productName: 'Hydrating cream' })).toBe(
      'MOISTURIZER',
    );
    expect(resolveRoutineStepRole({ productName: 'Unknown product' })).toBe(
      'SERUM',
    );
  });

  it('recognises Vietnamese step names typed by experts', () => {
    const byName = (productName: string) =>
      resolveRoutineStepRole({ productName });

    expect(byName('Sữa rửa mặt dịu nhẹ')).toBe('CLEANSER');
    expect(byName('Nước hoa hồng cân bằng')).toBe('TONER');
    expect(byName('Tinh chất Niacinamide')).toBe('SERUM');
    expect(byName('Gel đặc trị mụn')).toBe('TREATMENT');
    expect(byName('Kem dưỡng ẩm ban đêm')).toBe('MOISTURIZER');
    // "kem chống nắng" must not be read as a moisturiser
    expect(byName('Kem chống nắng SPF50+')).toBe('SUNSCREEN');
  });

  it('ranks steps cleanser → toner → serum → treatment → moisturizer → sunscreen', () => {
    const ranks = [
      'CLEANSER',
      'TONER',
      'SERUM',
      'TREATMENT',
      'MOISTURIZER',
      'SUNSCREEN',
    ].map((categoryCode) => resolveRoutineStepRank({ categoryCode }));

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('returns a dosage for every role', () => {
    expect(resolveDefaultDosage({ categoryCode: 'CLEANSER' })).toEqual({
      amountMl: 2,
      dosageText: 'bằng hạt đậu',
    });
    expect(resolveDefaultDosage({ categoryCode: 'SUNSCREEN' })).toEqual({
      amountMl: 2,
      dosageText: 'hai đốt ngón tay',
    });
    expect(resolveDefaultDosage({ categoryCode: 'TREATMENT' })).toEqual({
      amountMl: 1,
      dosageText: 'lớp mỏng',
    });
  });

  it('never makes the first step of a period wait', () => {
    expect(resolveDefaultWaitMinutes({ categoryCode: 'SERUM' }, true)).toBe(0);
    expect(resolveDefaultWaitMinutes({ categoryCode: 'SERUM' }, false)).toBe(5);
    expect(
      resolveDefaultWaitMinutes({ categoryCode: 'MOISTURIZER' }, false),
    ).toBe(2);
    expect(resolveDefaultWaitMinutes({ categoryCode: 'CLEANSER' }, false)).toBe(
      0,
    );
  });
});
