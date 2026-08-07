import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  MAX_SKIN_VISION_EXPLANATION_LENGTH,
  MOCK_SKIN_VISION_LABEL_POOL,
  SkinVisionAnalyzeInput,
  SkinVisionAnalyzeOutput,
  SkinVisionProvider,
} from './skin-vision.types';

/** Deterministic short Vietnamese explanations keyed by allow-listed label code. */
export const MOCK_SKIN_VISION_EXPLANATIONS: Record<string, string> = {
  ACNE: 'Có nhiều nốt viêm đỏ dọc vùng chữ T, phù hợp với tình trạng mụn.',
  OILY_TENDENCY: 'Da bóng dầu rõ ở mũi và trán, gợi ý xu hướng da dầu.',
  HYPERPIGMENTATION:
    'Có các vùng da sẫm màu không đều, gợi ý tăng sắc tố trên mặt.',
  REDNESS: 'Quầng đỏ lan trên má hoặc mũi dễ nhìn thấy.',
  DEHYDRATED_SKIN: 'Bề mặt da căng, xỉn màu gợi ý da thiếu nước.',
  ENLARGED_PORES: 'Lỗ chân lông to rõ trên mũi và má.',
  FINE_LINES: 'Có nếp nhăn nông quanh vùng biểu cảm trên mặt.',
  BLACKHEADS: 'Có nhân mụn đầu đen hở trên vùng quan sát.',
  ROUGH_TEXTURE: 'Bề mặt da sần sùi, không đều dễ nhận thấy.',
  BARRIER_DAMAGE:
    'Có vùng da khô bong hoặc kích ứng, gợi ý hàng rào da suy yếu.',
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
          `Có dấu hiệu quan sát được phù hợp với ${labelCode}.`
        ).slice(0, MAX_SKIN_VISION_EXPLANATION_LENGTH),
      })),
    });
  }
}
