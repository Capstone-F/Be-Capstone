import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { ConfigModule } from '../config/config.module';
import { MockSkinVisionProvider } from './mock-skin-vision.provider';
import { SKIN_VISION_PROVIDER } from './skin-vision.types';
import { UnimplementedSkinVisionProvider } from './unimplemented-skin-vision.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    MockSkinVisionProvider,
    UnimplementedSkinVisionProvider,
    {
      provide: SKIN_VISION_PROVIDER,
      inject: [
        AppConfigService,
        MockSkinVisionProvider,
        UnimplementedSkinVisionProvider,
      ],
      useFactory: (
        config: AppConfigService,
        mock: MockSkinVisionProvider,
        unimplemented: UnimplementedSkinVisionProvider,
      ) => {
        switch (config.llmProvider) {
          case 'ollama':
          case 'openai':
          case 'gemini':
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
