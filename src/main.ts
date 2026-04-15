import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { ENV_DEFINITIONS, getMissingRequiredEnv } from './config/env.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const missingEnvs = getMissingRequiredEnv();
  if (missingEnvs.length > 0) {
    logger.error(
      `Missing required environment variables: ${missingEnvs.join(', ')}`,
    );
  } else {
    logger.log('Environment validation passed');
  }

  logger.log(
    `Tracked env keys: ${Object.keys(ENV_DEFINITIONS).join(', ')}`,
  );

  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BE Capstone API')
    .setDescription('API documentation for BE Capstone service')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  logger.log('Swagger docs available at /docs');
  await app.listen(config.port);
}
bootstrap();
