import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { LLM_ROUTINE_PROVIDER } from './llm-routine.types';
import { MockLlmRoutineProvider } from './mock-llm-routine.provider';

@Module({
  providers: [
    MockLlmRoutineProvider,
    {
      provide: LLM_ROUTINE_PROVIDER,
      inject: [AppConfigService, MockLlmRoutineProvider],
      useFactory: (config: AppConfigService, mock: MockLlmRoutineProvider) => {
        // Future: switch on config.llmProvider for openai/gemini
        void config.llmProvider;
        return mock;
      },
    },
  ],
  exports: [LLM_ROUTINE_PROVIDER],
})
export class LlmModule {}
