import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('should return health payload from service', async () => {
    const healthPayload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      api: { status: 'up' },
      db: { status: 'up' },
      auth0: { status: 'up' },
      redis: { status: 'up' },
    };
    const healthService = {
      getHealthStatus: jest.fn().mockResolvedValue(healthPayload),
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    await expect(controller.getHealth()).resolves.toEqual(healthPayload);
    expect(healthService.getHealthStatus).toHaveBeenCalledTimes(1);
  });
});
