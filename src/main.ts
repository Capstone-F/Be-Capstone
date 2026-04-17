import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import session = require('express-session');
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { ENV_DEFINITIONS, getMissingRequiredEnv } from './config/env.config';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const missingEnvs = getMissingRequiredEnv();
  if (missingEnvs.length > 0) {
    logger.error(
      `Missing required environment variables: ${missingEnvs.join(', ')}`,
      'Bootstrap',
    );
  } else {
    logger.log('Environment validation passed', 'Bootstrap');
  }

  logger.log(
    `Tracked env keys: ${Object.keys(ENV_DEFINITIONS).join(', ')}`,
    'Bootstrap',
  );

  const appConfig = app.get(AppConfigService);

  if (appConfig.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  const redisClient = new Redis(appConfig.redisUrl);
  redisClient.on('error', (err) =>
    logger.error('Redis connection error', err instanceof Error ? err.stack : String(err), 'Bootstrap'),
  );
  redisClient.on('connect', () => logger.log('Connected to Redis', 'Bootstrap'));

  app.enableCors({
    origin: appConfig.corsOrigin,
    credentials: true,
  });

  app.use(
    session({
      name: 'sid',
      secret: appConfig.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new RedisStore({
        client: redisClient,
        prefix: 'sess:',
      }),
      cookie: {
        httpOnly: true,
        secure: appConfig.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BE Capstone API')
    .setDescription('API documentation for BE Capstone service')
    .setVersion('1.0')
    .addCookieAuth('sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'sid',
    })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  logger.log('Swagger docs available at /docs', 'Bootstrap');
  await app.listen(appConfig.port);
}
bootstrap();
