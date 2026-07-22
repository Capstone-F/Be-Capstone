import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import {
  LlmRoutineProvider,
  RoutineGenerationInput,
  RoutineGenerationOutput,
} from './llm-routine.types';
import {
  buildOllamaRoutineUserPrompt,
  OLLAMA_ROUTINE_SYSTEM_PROMPT,
} from './ollama-routine.prompt';
import { parseRoutineGenerationOutput } from './routine-output.parser';

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

/**
 * Ollama-backed routine generator. Calls local Ollama /api/chat with JSON format.
 */
@Injectable()
export class OllamaLlmRoutineProvider implements LlmRoutineProvider {
  private readonly logger = new Logger(OllamaLlmRoutineProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async generateRoutine(
    input: RoutineGenerationInput,
  ): Promise<RoutineGenerationOutput> {
    const { ollamaBaseUrl, ollamaModel, ollamaTimeoutMs } =
      this.config.llmConfig;
    const url = `${ollamaBaseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: OLLAMA_ROUTINE_SYSTEM_PROMPT },
            { role: 'user', content: buildOllamaRoutineUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(ollamaTimeoutMs),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown network error';
      this.logger.error(`Ollama request failed: ${message}`);
      throw new ServiceUnavailableException(
        `Ollama is unavailable: ${message}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Ollama returned ${response.status}: ${body.slice(0, 200)}`,
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

    return parseRoutineGenerationOutput(content);
  }
}
