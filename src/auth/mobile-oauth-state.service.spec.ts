import { MobileOauthStateService } from './mobile-oauth-state.service';
import { AppConfigService } from '../config/config.service';

describe('MobileOauthStateService', () => {
  const redis = {
    set: jest.fn(),
    getDel: jest.fn(),
  };
  const config = {
    mobileOauthStateTtlSeconds: 600,
  } as AppConfigService;

  const service = new MobileOauthStateService(redis as any, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create state with TTL and return random state', async () => {
    redis.set.mockResolvedValue('OK');

    const state = await service.create('glowscan://auth/callback', 'google');

    expect(state).toBeTruthy();
    expect(typeof state).toBe('string');
    expect(redis.set).toHaveBeenCalledWith(
      `oauth:state:${state}`,
      expect.stringContaining('"flow":"mobile"'),
      { EX: 600 },
    );
    const payload = JSON.parse(redis.set.mock.calls[0][1]);
    expect(payload.clientRedirectUri).toBe('glowscan://auth/callback');
    expect(payload.idpHint).toBe('google');
  });

  it('should consume state once via getDel', async () => {
    redis.getDel.mockResolvedValueOnce(
      JSON.stringify({
        clientRedirectUri: 'glowscan://auth/callback',
        flow: 'mobile',
        createdAt: Date.now(),
      }),
    );

    const first = await service.consume('abc');
    expect(first?.clientRedirectUri).toBe('glowscan://auth/callback');
    expect(redis.getDel).toHaveBeenCalledWith('oauth:state:abc');

    redis.getDel.mockResolvedValueOnce(null);
    const second = await service.consume('abc');
    expect(second).toBeNull();
  });

  it('should return null for empty state', async () => {
    expect(await service.consume('')).toBeNull();
    expect(redis.getDel).not.toHaveBeenCalled();
  });
});
