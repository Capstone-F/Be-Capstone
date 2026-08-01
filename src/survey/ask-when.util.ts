import { QuestionAskWhen } from './question.entity';

/** Same bands as rule-engine profile labels. */
export const AGE_GROUP_CODES = [
  { code: 'UNDER_18', min: 0, max: 17 },
  { code: 'AGE_18_25', min: 18, max: 25 },
  { code: 'AGE_26_35', min: 26, max: 35 },
  { code: 'AGE_36_45', min: 36, max: 45 },
  { code: 'AGE_46_60', min: 46, max: 60 },
  { code: 'ABOVE_60', min: 61, max: Infinity },
] as const;

export type AskWhenContext = {
  answeredLabelCodes: ReadonlySet<string>;
  age: number | null;
  ageGroupCode: string | null;
};

export function computeAge(dateOfBirth: Date): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function deriveAgeGroupCode(dateOfBirth: Date | null): string | null {
  if (!dateOfBirth) return null;
  const age = computeAge(dateOfBirth);
  return (
    AGE_GROUP_CODES.find((entry) => age >= entry.min && age <= entry.max)
      ?.code ?? null
  );
}

export function buildAskWhenContext(
  answeredLabelCodes: ReadonlySet<string>,
  dateOfBirth: Date | null | undefined,
): AskWhenContext {
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  return {
    answeredLabelCodes,
    age: dob ? computeAge(dob) : null,
    ageGroupCode: deriveAgeGroupCode(dob),
  };
}

/**
 * Evaluate enriched askWhen rules.
 *
 * Positive unlock groups (`anyLabelCodes`, `allLabelCodes`, age gates) combine with
 * `match`: `'any'` (default, OR) or `'all'` (AND).
 * `noneLabelCodes` is always an additional AND constraint when present.
 * `always: true` with no other positive groups unlocks.
 */
export function matchesAskWhen(
  askWhen: QuestionAskWhen | null | undefined,
  ctx: AskWhenContext,
): boolean {
  if (!askWhen) return false;
  if (askWhen.always === true && !hasPositiveGates(askWhen)) {
    return satisfiesNoneConstraint(askWhen, ctx);
  }

  const positive: boolean[] = [];

  if (askWhen.anyLabelCodes?.length) {
    positive.push(
      askWhen.anyLabelCodes.some((code) => ctx.answeredLabelCodes.has(code)),
    );
  }
  if (askWhen.allLabelCodes?.length) {
    positive.push(
      askWhen.allLabelCodes.every((code) => ctx.answeredLabelCodes.has(code)),
    );
  }
  if (askWhen.anyAgeGroupCodes?.length) {
    positive.push(
      ctx.ageGroupCode != null &&
        askWhen.anyAgeGroupCodes.includes(ctx.ageGroupCode),
    );
  }
  if (askWhen.minAge != null || askWhen.maxAge != null) {
    if (ctx.age == null) {
      positive.push(false);
    } else {
      const minOk = askWhen.minAge == null || ctx.age >= askWhen.minAge;
      const maxOk = askWhen.maxAge == null || ctx.age <= askWhen.maxAge;
      positive.push(minOk && maxOk);
    }
  }

  if (positive.length === 0) {
    return askWhen.always === true && satisfiesNoneConstraint(askWhen, ctx);
  }

  const mode = askWhen.match ?? 'any';
  const positiveOk =
    mode === 'all' ? positive.every(Boolean) : positive.some(Boolean);

  return positiveOk && satisfiesNoneConstraint(askWhen, ctx);
}

function hasPositiveGates(askWhen: QuestionAskWhen): boolean {
  return Boolean(
    askWhen.anyLabelCodes?.length ||
    askWhen.allLabelCodes?.length ||
    askWhen.anyAgeGroupCodes?.length ||
    askWhen.minAge != null ||
    askWhen.maxAge != null,
  );
}

function satisfiesNoneConstraint(
  askWhen: QuestionAskWhen,
  ctx: AskWhenContext,
): boolean {
  if (!askWhen.noneLabelCodes?.length) return true;
  return askWhen.noneLabelCodes.every(
    (code) => !ctx.answeredLabelCodes.has(code),
  );
}
