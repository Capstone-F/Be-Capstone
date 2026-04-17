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
    const [db, keycloak, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkKeycloak(),
      this.checkRedis(),
    ]);
    const allUp =
      db.status === 'up' && keycloak.status === 'up' && redis.status === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      api,
      db,
      keycloak,
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

  private async checkKeycloak(): Promise<ComponentHealth> {
    try {
      const url = this.config.keycloakHealthUrl;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        // /health/ready often returns 503 until ready — not an application fault; avoid level-50 noise.
        const st = response.statusText?.trim();
        this.logger.warn(
          `Keycloak health check: HTTP ${response.status}${st ? ` ${st}` : ''} (${url})`,
        );
        return {
          status: 'down',
          detail: `Keycloak responded with status ${response.status}`,
        };
      }

      return { status: 'up' };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown keycloak error';
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
