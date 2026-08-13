import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { geminiGenerateContentJson } from '../llm/gemini-api.client';
import {
  buildOllamaSkinVisionUserPrompt,
  OLLAMA_SKIN_VISION_SYSTEM_PROMPT,
} from './ollama-skin-vision.prompt';
import { parseSkinVisionOutput } from './skin-vision-output.parser';
import {
  SkinVisionAnalyzeInput,
  SkinVisionAnalyzeOutput,
  SkinVisionProvider,
} from './skin-vision.types';

/**
 * Gemini multimodal face analyzer (default model: gemini-2.5-flash-lite).
 */
@Injectable()
export class GeminiSkinVisionProvider implements SkinVisionProvider {
  private readonly logger = new Logger(GeminiSkinVisionProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async analyze(
    input: SkinVisionAnalyzeInput,
  ): Promise<SkinVisionAnalyzeOutput> {
    if (!input.imageBase64?.trim()) {
      throw new ServiceUnavailableException(
        'Skin vision yêu cầu imageBase64 để phân tích bằng Gemini',
      );
    }

    const { geminiApiKey, geminiModel, ollamaTimeoutMs } =
      this.config.llmConfig;

    const content = await geminiGenerateContentJson({
      apiKey: geminiApiKey,
      model: geminiModel,
      systemInstruction: OLLAMA_SKIN_VISION_SYSTEM_PROMPT,
      parts: [
        { text: buildOllamaSkinVisionUserPrompt() },
        {
          inlineData: {
            mimeType: input.mimeType || 'image/jpeg',
            data: input.imageBase64,
          },
        },
      ],
      timeoutMs: ollamaTimeoutMs,
      logger: this.logger,
    });

    try {
      return parseSkinVisionOutput(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parse error';
      this.logger.error(`Failed to parse skin vision output: ${message}`);
      throw new ServiceUnavailableException(
        `Skin vision Gemini trả về kết quả không sử dụng được: ${message}`,
      );
    }
  }
}
