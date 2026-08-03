import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  SkinVisionAnalyzeInput,
  SkinVisionAnalyzeOutput,
  SkinVisionProvider,
} from './skin-vision.types';

/**
 * Placeholder for Ollama / OpenAI vision. Reserved until wired.
 * Selected when LLM_PROVIDER is ollama | openai | gemini.
 */
@Injectable()
export class UnimplementedSkinVisionProvider implements SkinVisionProvider {
  analyze(input: SkinVisionAnalyzeInput): Promise<SkinVisionAnalyzeOutput> {
    return Promise.reject(
      new ServiceUnavailableException(
        `Skin vision is not implemented for this LLM_PROVIDER (refusing ${input.imageUrl}). Use LLM_PROVIDER=mock.`,
      ),
    );
  }
}
