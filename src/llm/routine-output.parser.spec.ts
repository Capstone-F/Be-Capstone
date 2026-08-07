import { InternalServerErrorException } from '@nestjs/common';
import { RoutinePeriod } from '../routines/enums';
import { parseRoutineGenerationOutput } from './routine-output.parser';

describe('parseRoutineGenerationOutput', () => {
  const validJson = {
    title: 'Quy trình buổi sáng',
    description: 'Quy trình chăm sóc da sáng/tối đơn giản',
    steps: [
      {
        name: 'Serum',
        period: 'MORNING',
        stepOrder: 1,
        instructions: 'Sử dụng 2-3 giọt lên da sạch và vỗ nhẹ đến khi thấm.',
        productVariantId: 'v1',
        protocolId: 'p1',
        amountMl: 2,
      },
    ],
  };

  it('parses a valid JSON object', () => {
    const result = parseRoutineGenerationOutput(JSON.stringify(validJson));
    expect(result.title).toBe('Quy trình buổi sáng');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toEqual({
      name: 'Serum',
      period: RoutinePeriod.MORNING,
      stepOrder: 1,
      instructions: 'Sử dụng 2-3 giọt lên da sạch và vỗ nhẹ đến khi thấm.',
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
            dosageText: '2-3 giọt',
          },
        ],
      }),
    );
    expect(result.steps[0].waitMinutes).toBe(5);
    expect(result.steps[0].dosageText).toBe('2-3 giọt');
  });

  it('extracts JSON from markdown fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validJson)}\n\`\`\``;
    const result = parseRoutineGenerationOutput(fenced);
    expect(result.title).toBe('Quy trình buổi sáng');
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
            instructions: 'Rửa mặt nhẹ nhàng',
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
            instructions: 'Thoa đều',
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
