import { InternalServerErrorException } from '@nestjs/common';
import { RoutinePeriod } from '../routines/enums';
import { parseRoutineGenerationOutput } from './routine-output.parser';

describe('parseRoutineGenerationOutput', () => {
  const validJson = {
    title: 'Morning glow',
    description: 'A simple AM/PM routine',
    steps: [
      {
        name: 'Serum',
        period: 'MORNING',
        stepOrder: 1,
        instructions: 'Apply 2 drops',
        productVariantId: 'v1',
        protocolId: 'p1',
        amountMl: 2,
      },
    ],
  };

  it('parses a valid JSON object', () => {
    const result = parseRoutineGenerationOutput(JSON.stringify(validJson));
    expect(result.title).toBe('Morning glow');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toEqual({
      name: 'Serum',
      period: RoutinePeriod.MORNING,
      stepOrder: 1,
      instructions: 'Apply 2 drops',
      productVariantId: 'v1',
      protocolId: 'p1',
      amountMl: 2,
      waitMinutes: null,
      dosageText: null,
    });
  });

  it('parses waitMinutes and dosageText', () => {
    const result = parseRoutineGenerationOutput(
      JSON.stringify({
        ...validJson,
        steps: [
          {
            ...validJson.steps[0],
            waitMinutes: 5,
            dosageText: '2 drops',
          },
        ],
      }),
    );
    expect(result.steps[0].waitMinutes).toBe(5);
    expect(result.steps[0].dosageText).toBe('2 drops');
  });

  it('extracts JSON from markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validJson)}\n\`\`\``;
    const result = parseRoutineGenerationOutput(fenced);
    expect(result.title).toBe('Morning glow');
  });

  it('coerces missing protocolId and amountMl to null', () => {
    const result = parseRoutineGenerationOutput(
      JSON.stringify({
        title: 'T',
        description: 'D',
        steps: [
          {
            name: 'Cleanser',
            period: 'EVENING',
            stepOrder: 1,
            instructions: 'Wash face',
            productVariantId: 'v2',
          },
        ],
      }),
    );
    expect(result.steps[0].protocolId).toBeNull();
    expect(result.steps[0].amountMl).toBeNull();
    expect(result.steps[0].waitMinutes).toBeNull();
    expect(result.steps[0].dosageText).toBeNull();
  });

  it('coerces invalid waitMinutes and empty dosageText to null', () => {
    const result = parseRoutineGenerationOutput(
      JSON.stringify({
        title: 'T',
        description: 'D',
        steps: [
          {
            name: 'Serum',
            period: 'MORNING',
            stepOrder: 1,
            instructions: 'Apply',
            productVariantId: 'v1',
            waitMinutes: -1,
            dosageText: '   ',
          },
        ],
      }),
    );
    expect(result.steps[0].waitMinutes).toBeNull();
    expect(result.steps[0].dosageText).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseRoutineGenerationOutput('not-json')).toThrow(
      InternalServerErrorException,
    );
  });

  it('throws on invalid period', () => {
    expect(() =>
      parseRoutineGenerationOutput(
        JSON.stringify({
          ...validJson,
          steps: [{ ...validJson.steps[0], period: 'NOON' }],
        }),
      ),
    ).toThrow(InternalServerErrorException);
  });

  it('throws when steps is missing', () => {
    expect(() =>
      parseRoutineGenerationOutput(
        JSON.stringify({ title: 'T', description: 'D' }),
      ),
    ).toThrow(InternalServerErrorException);
  });
});
