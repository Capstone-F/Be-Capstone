import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppConfigService } from '../config/config.service';

type ComponentHealth = {
  status: 'up' | 'down';
  detail?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly logger: Logger,
    private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  async getHealthStatus() {
    const api: ComponentHealth = { status: 'up' };
    const db = await this.checkDatabase();
    const keycloak = await this.checkKeycloak();
    const overallStatus =
      db.status === 'up' && keycloak.status === 'up' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      api,
      db,
      keycloak,
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
        this.logger.error(`Keycloak URL: ${url}`);
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
}
