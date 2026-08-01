import { buildAskWhenContext, matchesAskWhen } from './ask-when.util';

describe('matchesAskWhen', () => {
  const base = buildAskWhenContext(new Set(['ACNE']), new Date('2000-01-01'));

  it('returns false for null askWhen', () => {
    expect(matchesAskWhen(null, base)).toBe(false);
  });

  it('unlocks on always when no positive gates', () => {
    expect(matchesAskWhen({ always: true }, base)).toBe(true);
  });

  it('unlocks on anyLabelCodes', () => {
    expect(matchesAskWhen({ anyLabelCodes: ['ACNE', 'MELASMA'] }, base)).toBe(
      true,
    );
    expect(matchesAskWhen({ anyLabelCodes: ['MELASMA'] }, base)).toBe(false);
  });

  it('requires allLabelCodes', () => {
    const ctx = buildAskWhenContext(
      new Set(['ACNE', 'HOT_HUMID']),
      new Date('2000-01-01'),
    );
    expect(matchesAskWhen({ allLabelCodes: ['ACNE', 'HOT_HUMID'] }, ctx)).toBe(
      true,
    );
    expect(matchesAskWhen({ allLabelCodes: ['ACNE', 'MELASMA'] }, ctx)).toBe(
      false,
    );
  });

  it('blocks on noneLabelCodes', () => {
    expect(
      matchesAskWhen({ always: true, noneLabelCodes: ['ACNE'] }, base),
    ).toBe(false);
  });

  it('unlocks on age group from profile DOB', () => {
    // ~26 years old in 2026 → AGE_26_35
    const ctx = buildAskWhenContext(new Set(), new Date('2000-06-15'));
    expect(ctx.ageGroupCode).toBe('AGE_26_35');
    expect(matchesAskWhen({ anyAgeGroupCodes: ['AGE_26_35'] }, ctx)).toBe(true);
    expect(matchesAskWhen({ anyAgeGroupCodes: ['UNDER_18'] }, ctx)).toBe(false);
  });

  it('unlocks on minAge / maxAge', () => {
    const ctx = buildAskWhenContext(new Set(), new Date('2000-06-15'));
    expect(matchesAskWhen({ minAge: 25, maxAge: 35 }, ctx)).toBe(true);
    expect(matchesAskWhen({ minAge: 40 }, ctx)).toBe(false);
  });

  it('ORs positive gates by default and ANDs when match=all', () => {
    const ctx = buildAskWhenContext(new Set(['ACNE']), new Date('2010-01-01'));
    expect(
      matchesAskWhen(
        {
          anyLabelCodes: ['ACNE'],
          anyAgeGroupCodes: ['AGE_36_45'],
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      matchesAskWhen(
        {
          match: 'all',
          anyLabelCodes: ['ACNE'],
          anyAgeGroupCodes: ['AGE_36_45'],
        },
        ctx,
      ),
    ).toBe(false);
  });

  it('fails age gates when DOB is missing', () => {
    const ctx = buildAskWhenContext(new Set(['ACNE']), null);
    expect(matchesAskWhen({ anyAgeGroupCodes: ['AGE_18_25'] }, ctx)).toBe(
      false,
    );
    expect(matchesAskWhen({ minAge: 18 }, ctx)).toBe(false);
  });
});
