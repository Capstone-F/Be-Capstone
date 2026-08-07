import { parseSkinVisionOutput } from './skin-vision-output.parser';

describe('parseSkinVisionOutput', () => {
  it('parses valid labels and trims explanations', () => {
    const result = parseSkinVisionOutput(
      JSON.stringify({
        labels: [
          {
            code: 'ACNE',
            explanation: '  Có nhiều nốt viêm đỏ dọc vùng chữ T.  ',
          },
          {
            code: 'REDNESS',
            explanation: 'Quầng đỏ trên má.',
          },
        ],
      }),
    );

    expect(result.findings).toEqual([
      {
        labelCode: 'ACNE',
        explanation: 'Có nhiều nốt viêm đỏ dọc vùng chữ T.',
      },
      { labelCode: 'REDNESS', explanation: 'Quầng đỏ trên má.' },
    ]);
  });

  it('drops unknown codes and empty explanations', () => {
    const result = parseSkinVisionOutput(
      JSON.stringify({
        labels: [
          { code: 'NOT_A_REAL_CODE', explanation: 'Nope' },
          { code: 'ACNE', explanation: '' },
          { code: 'OILY_TENDENCY', explanation: 'Da bóng dầu rõ trên mặt.' },
        ],
      }),
    );

    expect(result.findings).toEqual([
      {
        labelCode: 'OILY_TENDENCY',
        explanation: 'Da bóng dầu rõ trên mặt.',
      },
    ]);
  });

  it('returns empty findings for empty labels', () => {
    expect(parseSkinVisionOutput(JSON.stringify({ labels: [] }))).toEqual({
      findings: [],
    });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSkinVisionOutput('{')).toThrow(/not valid JSON/);
  });

  it('throws when labels array is missing', () => {
    expect(() => parseSkinVisionOutput(JSON.stringify({}))).toThrow(
      /missing labels array/,
    );
  });
});
