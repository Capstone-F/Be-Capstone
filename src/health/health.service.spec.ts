import { DataSource } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { HealthService } from './health.service';
import { Logger } from '@nestjs/common';

describe('HealthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should return ok when database and keycloak are up', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    const config = {
      keycloakHealthUrl: 'http://localhost:9000/health/ready',
    } as AppConfigService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = new HealthService(new Logger(), dataSource, config);

    const result = await service.getHealthStatus();

    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9000/health/ready',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.status).toBe('ok');
    expect(result.api.status).toBe('up');
    expect(result.db.status).toBe('up');
    expect(result.keycloak.status).toBe('up');
  });

  it('should return degraded when database is down', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('db is down')),
    } as unknown as DataSource;
    const config = {
      keycloakHealthUrl: 'http://localhost:9000/health/ready',
    } as AppConfigService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = new HealthService(new Logger(), dataSource, config);

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.db.status).toBe('down');
    expect(result.db.detail).toContain('db is down');
    expect(result.keycloak.status).toBe('up');
  });

  it('should return degraded when keycloak is down', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    const config = {
      keycloakHealthUrl: 'http://localhost:9000/health/ready',
    } as AppConfigService;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);
    const service = new HealthService(new Logger(), dataSource, config);

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.db.status).toBe('up');
    expect(result.keycloak.status).toBe('down');
    expect(result.keycloak.detail).toContain('503');
  });
});
