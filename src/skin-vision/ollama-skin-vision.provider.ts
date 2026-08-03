import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
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

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

/**
 * Ollama multimodal face analyzer. Sends the image as base64 to /api/chat.
 */
@Injectable()
export class OllamaSkinVisionProvider implements SkinVisionProvider {
  private readonly logger = new Logger(OllamaSkinVisionProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async analyze(
    input: SkinVisionAnalyzeInput,
  ): Promise<SkinVisionAnalyzeOutput> {
    if (!input.imageBase64?.trim()) {
      throw new ServiceUnavailableException(
        'Skin vision requires imageBase64 for Ollama analysis',
      );
    }

    const { ollamaBaseUrl, ollamaVisionModel, ollamaTimeoutMs } =
      this.config.llmConfig;
    const url = `${ollamaBaseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaVisionModel,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: OLLAMA_SKIN_VISION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildOllamaSkinVisionUserPrompt(),
              images: [input.imageBase64],
            },
          ],
        }),
        signal: AbortSignal.timeout(ollamaTimeoutMs),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown network error';
      this.logger.error(`Ollama skin vision request failed: ${message}`);
      throw new ServiceUnavailableException(
        `Ollama is unavailable: ${message}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Ollama skin vision returned ${response.status}: ${body.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException(
        `Ollama request failed with status ${response.status}`,
      );
    }

    let payload: OllamaChatResponse;
    try {
      payload = (await response.json()) as OllamaChatResponse;
    } catch {
      throw new ServiceUnavailableException(
        'Ollama returned a non-JSON response',
      );
    }

    if (payload.error) {
      throw new ServiceUnavailableException(`Ollama error: ${payload.error}`);
    }

    const content = payload.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ServiceUnavailableException(
        'Ollama response missing message content',
      );
    }

    try {
      return parseSkinVisionOutput(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parse error';
      this.logger.error(`Failed to parse skin vision output: ${message}`);
      throw new ServiceUnavailableException(
        `Ollama skin vision returned unusable output: ${message}`,
      );
    }
  }
}
