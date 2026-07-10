import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { AppConfigService } from '../config/config.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): RedisClientType => {
        return createClient({ url: config.redisUrl }) as RedisClientType;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

  async onModuleInit(): Promise<void> {
    this.redis.on('error', (err) =>
      this.logger.error(
        'Redis client error',
        err instanceof Error ? err.stack : String(err),
      ),
    );
    if (!this.redis.isOpen) {
      await this.redis.connect();
      this.logger.log('Connected to Redis (app client)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.quit();
    }
  }
}
