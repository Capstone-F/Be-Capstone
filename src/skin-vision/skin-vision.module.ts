import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { ConfigModule } from '../config/config.module';
import { GeminiSkinVisionProvider } from './gemini-skin-vision.provider';
import { MockSkinVisionProvider } from './mock-skin-vision.provider';
import { OllamaSkinVisionProvider } from './ollama-skin-vision.provider';
import { SKIN_VISION_PROVIDER } from './skin-vision.types';
import { UnimplementedSkinVisionProvider } from './unimplemented-skin-vision.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    MockSkinVisionProvider,
    OllamaSkinVisionProvider,
    GeminiSkinVisionProvider,
    UnimplementedSkinVisionProvider,
    {
      provide: SKIN_VISION_PROVIDER,
      inject: [
        AppConfigService,
        MockSkinVisionProvider,
        OllamaSkinVisionProvider,
        GeminiSkinVisionProvider,
        UnimplementedSkinVisionProvider,
      ],
      useFactory: (
        config: AppConfigService,
        mock: MockSkinVisionProvider,
        ollama: OllamaSkinVisionProvider,
        gemini: GeminiSkinVisionProvider,
        unimplemented: UnimplementedSkinVisionProvider,
      ) => {
        switch (config.llmProvider) {
          case 'gemini':
            return gemini;
          case 'ollama':
            return ollama;
          case 'openai':
            return unimplemented;
          case 'mock':
          default:
            return mock;
        }
      },
    },
  ],
  exports: [SKIN_VISION_PROVIDER],
})
export class SkinVisionModule {}
