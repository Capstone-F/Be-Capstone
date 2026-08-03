import { MockSkinVisionProvider } from './mock-skin-vision.provider';
import { MOCK_SKIN_VISION_LABEL_POOL } from './skin-vision.types';

describe('MockSkinVisionProvider', () => {
  const provider = new MockSkinVisionProvider();

  const input = {
    imageUrl: 'https://cdn.example.com/face-a.jpg',
    imageBase64: 'aaa',
    mimeType: 'image/jpeg',
  };

  it('returns deterministic findings with explanations for the same URL', async () => {
    const a = await provider.analyze(input);
    const b = await provider.analyze(input);

    expect(a.findings).toEqual(b.findings);
    expect(a.findings.length).toBeGreaterThanOrEqual(2);
    expect(a.findings.length).toBeLessThanOrEqual(4);
    for (const finding of a.findings) {
      expect(MOCK_SKIN_VISION_LABEL_POOL).toContain(finding.labelCode);
      expect(finding.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it('can return different codes for different URLs', async () => {
    const a = await provider.analyze(input);
    const b = await provider.analyze({
      ...input,
      imageUrl: 'https://cdn.example.com/face-b.jpg',
    });

    expect(a.findings.map((f) => f.labelCode).join(',')).not.toEqual(
      b.findings.map((f) => f.labelCode).join(','),
    );
  });
});
