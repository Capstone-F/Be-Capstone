import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres',
        url: config.databaseUrl,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
  ],
  controllers: [AppController, HealthController, AuthController],
  providers: [AppService, HealthService, AuthService, Logger],
})
export class AppModule {}
