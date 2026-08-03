import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  MOCK_SKIN_VISION_LABEL_POOL,
  SkinVisionAnalyzeInput,
  SkinVisionAnalyzeOutput,
  SkinVisionProvider,
} from './skin-vision.types';

/**
 * Deterministic mock face analyzer for demos and tests.
 * Picks 2–4 codes from the fixed pool based on a hash of the image URL.
 */
@Injectable()
export class MockSkinVisionProvider implements SkinVisionProvider {
  analyze(input: SkinVisionAnalyzeInput): Promise<SkinVisionAnalyzeOutput> {
    const digest = createHash('sha256').update(input.imageUrl.trim()).digest();
    const count = 2 + (digest[0] % 3); // 2..4
    const codes: string[] = [];
    const pool = [...MOCK_SKIN_VISION_LABEL_POOL];

    for (let i = 0; i < count && pool.length > 0; i += 1) {
      const index = digest[i + 1] % pool.length;
      codes.push(pool.splice(index, 1)[0]);
    }

    return Promise.resolve({ labelCodes: codes });
  }
}
