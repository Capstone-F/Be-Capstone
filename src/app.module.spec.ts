import { MODULE_METADATA } from '@nestjs/common/constants';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

describe('AppModule', () => {
  it('should configure imports, controllers and providers', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);

    expect(imports).toEqual(
      expect.arrayContaining([ConfigModule, expect.any(Object)]),
    );
    expect(controllers).toEqual(
      expect.arrayContaining([AppController, HealthController, AuthController]),
    );
    expect(providers).toEqual(
      expect.arrayContaining([AppService, HealthService, AuthService]),
    );
  });

  it('should register TypeOrm async module', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const hasTypeOrmImport = imports.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'module' in entry &&
        (entry as { module?: unknown }).module === TypeOrmModule,
    );

    expect(hasTypeOrmImport).toBe(true);
  });
});
