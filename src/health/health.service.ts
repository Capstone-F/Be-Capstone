import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

type ComponentHealth = {
  status: 'up' | 'down';
  detail?: string;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async getHealthStatus() {
    const api: ComponentHealth = { status: 'up' };
    const [db, auth0, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkAuth0(),
      this.checkRedis(),
    ]);
    const allUp =
      db.status === 'up' && auth0.status === 'up' && redis.status === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      api,
      db,
      auth0,
      redis,
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown database error';
      return { status: 'down', detail };
    }
  }

  private async checkAuth0(): Promise<ComponentHealth> {
    const url = `${this.config.auth0Issuer}.well-known/openid-configuration`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        const st = response.statusText?.trim();
        this.logger.warn(
          `Auth0 health check: HTTP ${response.status}${st ? ` ${st}` : ''} (${url})`,
        );
        return {
          status: 'down',
          detail: `Auth0 responded with status ${response.status}`,
        };
      }

      return { status: 'up' };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown auth0 error';
      return { status: 'down', detail };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    try {
      await this.redis.connect();
      const result = await this.redis.ping();
      this.redis.disconnect();
      return result === 'PONG'
        ? { status: 'up' }
        : {
            status: 'down',
            detail: `Unexpected PING response: ${String(result)}`,
          };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown redis error';
      return { status: 'down', detail };
    }
  }
}
