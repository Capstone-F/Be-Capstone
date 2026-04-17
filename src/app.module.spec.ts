import { MODULE_METADATA } from '@nestjs/common/constants';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

describe('AppModule', () => {
  it('should configure imports, controllers and providers', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    );
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);

    expect(imports).toEqual(
      expect.arrayContaining([ConfigModule, AuthModule, expect.any(Object)]),
    );
    expect(controllers).toEqual(
      expect.arrayContaining([AppController, HealthController]),
    );
    expect(providers).toEqual(
      expect.arrayContaining([AppService, HealthService]),
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

  it('should register LoggerModule (pino)', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
    const hasPinoImport = imports.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'module' in entry &&
        String(
          (entry as { module?: { name?: string } }).module?.name ?? '',
        ).includes('Logger'),
    );

    expect(hasPinoImport).toBe(true);
  });
});
