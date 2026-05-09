import { AppConfigService } from './config.service';

describe('AppConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PORT: '4500',
      DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
      AUTH0_DOMAIN: 'tenant.us.auth0.com',
      AUTH0_CLIENT_ID: 'client-id',
      AUTH0_CLIENT_SECRET: 'client-secret',
      AUTH0_AUDIENCE: 'https://api.be-capstone.local',
      AUTH0_REDIRECT_URI: 'http://localhost:3000/auth/callback',
      SESSION_SECRET: 'test-session-secret',
      FRONTEND_URL: 'http://localhost:5173',
      CORS_ORIGIN: 'http://localhost:5173',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should expose resolved config values', () => {
    const service = new AppConfigService();

    expect(service.nodeEnv).toBe('test');
    expect(service.port).toBe(4500);
    expect(service.databaseUrl).toContain('postgresql://');
    expect(service.auth0Domain).toBe('tenant.us.auth0.com');
    expect(service.auth0Issuer).toBe('https://tenant.us.auth0.com/');
    expect(service.auth0ClientId).toBe('client-id');
    expect(service.auth0ClientSecret).toBe('client-secret');
    expect(service.auth0Audience).toBe('https://api.be-capstone.local');
    expect(service.auth0RedirectUri).toBe(
      'http://localhost:3000/auth/callback',
    );
    expect(service.auth0LogoutReturnUrl).toBe('http://localhost:5173');
    expect(service.sessionCookieSecure).toBe(false);
  });

  it('should return no missing keys when env is complete', () => {
    const service = new AppConfigService();
    expect(service.getMissingRequiredKeys()).toHaveLength(0);
  });

  it('should throw if required env is missing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH0_DOMAIN;

    expect(() => new AppConfigService()).toThrow(
      'Missing required environment variables',
    );
  });
});
