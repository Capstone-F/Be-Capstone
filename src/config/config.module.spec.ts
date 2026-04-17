import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from './config.module';
import { AppConfigService } from './config.service';

describe('ConfigModule', () => {
  it('should export AppConfigService', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ConfigModule,
    );
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ConfigModule);

    expect(providers).toContain(AppConfigService);
    expect(exports).toContain(AppConfigService);
  });
});
