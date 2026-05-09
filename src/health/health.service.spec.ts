import { DataSource } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { HealthService } from './health.service';

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    })),
  };
});

describe('HealthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeConfig(overrides?: Partial<AppConfigService>) {
    return {
      auth0Issuer: 'https://tenant.us.auth0.com/',
      redisUrl: 'redis://localhost:6379',
      ...overrides,
    } as AppConfigService;
  }

  it('should return ok when all components are up', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = new HealthService(dataSource, makeConfig());

    const result = await service.getHealthStatus();

    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://tenant.us.auth0.com/.well-known/openid-configuration',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.status).toBe('ok');
    expect(result.api.status).toBe('up');
    expect(result.db.status).toBe('up');
    expect(result.auth0.status).toBe('up');
    expect(result.redis.status).toBe('up');
  });

  it('should return degraded when database is down', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('db is down')),
    } as unknown as DataSource;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = new HealthService(dataSource, makeConfig());

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.db.status).toBe('down');
    expect(result.db.detail).toContain('db is down');
    expect(result.auth0.status).toBe('up');
  });

  it('should return degraded when auth0 is down', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as DataSource;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);
    const service = new HealthService(dataSource, makeConfig());

    const result = await service.getHealthStatus();

    expect(result.status).toBe('degraded');
    expect(result.db.status).toBe('up');
    expect(result.auth0.status).toBe('down');
    expect(result.auth0.detail).toContain('503');
  });
});
