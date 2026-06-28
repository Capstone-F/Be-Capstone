import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StockModule } from './stock/stock.module';
import { KeycloakAdminModule } from './keycloak/keycloak-admin.module';
import { ClinicsModule } from './clinics/clinics.module';
import { ProductsModule } from './products/products.module';
import { SurveyModule } from './survey/survey.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { RoutinesModule } from './routines/routines.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { CommerceModule } from './commerce/commerce.module';
import { DeliveryModule } from './delivery/delivery.module';

@Module({
  imports: [
    ConfigModule,
    KeycloakAdminModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
          transport:
            config.nodeEnv !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          autoLogging: true,
          redact: ['req.headers.cookie', 'req.headers.authorization'],
        },
      }),
    }),
    UsersModule,
    ClinicsModule,
    SurveyModule,
    IngredientsModule,
    ProductsModule,
    StockModule,
    RoutinesModule,
    TreatmentsModule,
    ConsultationsModule,
    CommerceModule,
    DeliveryModule,
    AuthModule,
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres',
        url: config.databaseUrl,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: true,
      }),
    }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, HealthService],
})
export class AppModule {}
