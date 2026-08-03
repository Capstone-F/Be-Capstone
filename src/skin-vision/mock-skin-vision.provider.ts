import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  MAX_SKIN_VISION_EXPLANATION_LENGTH,
  MOCK_SKIN_VISION_LABEL_POOL,
  SkinVisionAnalyzeInput,
  SkinVisionAnalyzeOutput,
  SkinVisionProvider,
} from './skin-vision.types';

/** Deterministic short explanations keyed by allow-listed label code. */
export const MOCK_SKIN_VISION_EXPLANATIONS: Record<string, string> = {
  ACNE: 'Visible inflammatory spots consistent with acne along the T-zone.',
  OILY_TENDENCY: 'Shine and sebum sheen suggest an oily skin tendency.',
  HYPERPIGMENTATION:
    'Uneven darker patches suggest hyperpigmentation on facial areas.',
  REDNESS: 'Diffuse facial redness is visible across cheeks or nose.',
  DEHYDRATED_SKIN: 'Tight, dull surface texture suggests dehydrated skin.',
  ENLARGED_PORES: 'Noticeably enlarged pores appear on the nose and cheeks.',
  FINE_LINES: 'Fine superficial lines are visible around expressive areas.',
  BLACKHEADS: 'Open comedones consistent with blackheads are visible.',
  ROUGH_TEXTURE: 'Uneven, rough surface texture is visible on the face.',
  BARRIER_DAMAGE:
    'Flaky or irritated patches suggest possible barrier compromise.',
};

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

    return Promise.resolve({
      findings: codes.map((labelCode) => ({
        labelCode,
        explanation: (
          MOCK_SKIN_VISION_EXPLANATIONS[labelCode] ??
          `Visual cues consistent with ${labelCode}.`
        ).slice(0, MAX_SKIN_VISION_EXPLANATION_LENGTH),
      })),
    });
  }
}
