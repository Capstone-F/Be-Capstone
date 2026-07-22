import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { LLM_ROUTINE_PROVIDER } from './llm-routine.types';
import { MockLlmRoutineProvider } from './mock-llm-routine.provider';
import { OllamaLlmRoutineProvider } from './ollama-llm-routine.provider';

@Module({
  providers: [
    MockLlmRoutineProvider,
    OllamaLlmRoutineProvider,
    {
      provide: LLM_ROUTINE_PROVIDER,
      inject: [
        AppConfigService,
        MockLlmRoutineProvider,
        OllamaLlmRoutineProvider,
      ],
      useFactory: (
        config: AppConfigService,
        mock: MockLlmRoutineProvider,
        ollama: OllamaLlmRoutineProvider,
      ) => {
        switch (config.llmProvider) {
          case 'ollama':
            return ollama;
          case 'mock':
          default:
            return mock;
        }
      },
    },
  ],
  exports: [LLM_ROUTINE_PROVIDER],
})
export class LlmModule {}
