import { MobileAuthCodeService } from './mobile-auth-code.service';
import { AppConfigService } from '../config/config.service';

describe('MobileAuthCodeService', () => {
  const redis = {
    set: jest.fn(),
    getDel: jest.fn(),
  };
  const config = {
    mobileAuthCodeTtlSeconds: 120,
  } as AppConfigService;

  const service = new MobileAuthCodeService(redis as any, config);

  const payload = {
    userId: 'u1',
    accessToken: 'at',
    refreshToken: 'rt',
    tokenExpiresAt: Date.now() + 60_000,
    expiresIn: 900,
    roles: ['customer'],
    isNewUser: false,
    idpHint: 'keycloak',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should issue code with TTL', async () => {
    redis.set.mockResolvedValue('OK');

    const code = await service.issue(payload);

    expect(code).toBeTruthy();
    expect(redis.set).toHaveBeenCalledWith(
      `oauth:mobile-code:${code}`,
      JSON.stringify(payload),
      { EX: 120 },
    );
  });

  it('should consume code once', async () => {
    redis.getDel.mockResolvedValueOnce(JSON.stringify(payload));
    const first = await service.consume('code-1');
    expect(first?.accessToken).toBe('at');

    redis.getDel.mockResolvedValueOnce(null);
    expect(await service.consume('code-1')).toBeNull();
  });

  it('should return null for empty code', async () => {
    expect(await service.consume('')).toBeNull();
  });
});
