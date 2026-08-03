import { parseSkinVisionOutput } from './skin-vision-output.parser';

describe('parseSkinVisionOutput', () => {
  it('parses valid labels and trims explanations', () => {
    const result = parseSkinVisionOutput(
      JSON.stringify({
        labels: [
          {
            code: 'ACNE',
            explanation: '  Visible spots on the T-zone.  ',
          },
          {
            code: 'REDNESS',
            explanation: 'Cheek redness.',
          },
        ],
      }),
    );

    expect(result.findings).toEqual([
      { labelCode: 'ACNE', explanation: 'Visible spots on the T-zone.' },
      { labelCode: 'REDNESS', explanation: 'Cheek redness.' },
    ]);
  });

  it('drops unknown codes and empty explanations', () => {
    const result = parseSkinVisionOutput(
      JSON.stringify({
        labels: [
          { code: 'NOT_A_REAL_CODE', explanation: 'Nope' },
          { code: 'ACNE', explanation: '' },
          { code: 'OILY_TENDENCY', explanation: 'Oily shine visible.' },
        ],
      }),
    );

    expect(result.findings).toEqual([
      { labelCode: 'OILY_TENDENCY', explanation: 'Oily shine visible.' },
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
