import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { geminiGenerateContentJson } from './gemini-api.client';
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

/**
 * Gemini-backed routine generator (default model: gemini-2.5-flash-lite).
 */
@Injectable()
export class GeminiLlmRoutineProvider implements LlmRoutineProvider {
  private readonly logger = new Logger(GeminiLlmRoutineProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async generateRoutine(
    input: RoutineGenerationInput,
  ): Promise<RoutineGenerationOutput> {
    const { geminiApiKey, geminiModel, ollamaTimeoutMs } =
      this.config.llmConfig;

    const content = await geminiGenerateContentJson({
      apiKey: geminiApiKey,
      model: geminiModel,
      systemInstruction: OLLAMA_ROUTINE_SYSTEM_PROMPT,
      parts: [{ text: buildOllamaRoutineUserPrompt(input) }],
      timeoutMs: ollamaTimeoutMs,
      logger: this.logger,
    });

    return parseRoutineGenerationOutput(content);
  }
}
