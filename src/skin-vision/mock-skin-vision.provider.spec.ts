import { MockSkinVisionProvider } from './mock-skin-vision.provider';
import { MOCK_SKIN_VISION_LABEL_POOL } from './skin-vision.types';

describe('MockSkinVisionProvider', () => {
  const provider = new MockSkinVisionProvider();

  it('returns deterministic label codes for the same URL', async () => {
    const a = await provider.analyze({
      imageUrl: 'https://cdn.example.com/face-a.jpg',
    });
    const b = await provider.analyze({
      imageUrl: 'https://cdn.example.com/face-a.jpg',
    });

    expect(a.labelCodes).toEqual(b.labelCodes);
    expect(a.labelCodes.length).toBeGreaterThanOrEqual(2);
    expect(a.labelCodes.length).toBeLessThanOrEqual(4);
    for (const code of a.labelCodes) {
      expect(MOCK_SKIN_VISION_LABEL_POOL).toContain(code);
    }
  });

  it('can return different codes for different URLs', async () => {
    const a = await provider.analyze({
      imageUrl: 'https://cdn.example.com/face-a.jpg',
    });
    const b = await provider.analyze({
      imageUrl: 'https://cdn.example.com/face-b.jpg',
    });

    expect(a.labelCodes.join(',')).not.toEqual(b.labelCodes.join(','));
  });
});
