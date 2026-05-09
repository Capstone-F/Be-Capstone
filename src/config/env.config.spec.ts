import {
  ENV_DEFINITIONS,
  getMissingRequiredEnv,
  resolveAppEnv,
} from './env.config';

const baseEnv = {
  DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
  AUTH0_DOMAIN: 'tenant.us.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret',
  AUTH0_AUDIENCE: 'https://api.be-capstone.local',
  SESSION_SECRET: 'test-secret',
  FRONTEND_URL: 'http://localhost:5173',
};

describe('env.config', () => {
  it('should define expected tracked env keys', () => {
    expect(Object.keys(ENV_DEFINITIONS)).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'AUTH0_DOMAIN',
        'AUTH0_CLIENT_ID',
        'AUTH0_CLIENT_SECRET',
        'AUTH0_AUDIENCE',
        'AUTH0_REDIRECT_URI',
        'AUTH0_LOGOUT_RETURN_URL',
        'REDIS_URL',
        'SESSION_SECRET',
        'SESSION_COOKIE_SECURE',
        'FRONTEND_URL',
        'CORS_ORIGIN',
      ]),
    );
  });

  it('should return missing required env keys', () => {
    const missing = getMissingRequiredEnv({
      NODE_ENV: 'development',
      PORT: '3000',
    });

    expect(missing).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'AUTH0_DOMAIN',
        'AUTH0_CLIENT_ID',
        'AUTH0_CLIENT_SECRET',
        'AUTH0_AUDIENCE',
        'SESSION_SECRET',
        'FRONTEND_URL',
      ]),
    );
  });

  it('should resolve env with defaults', () => {
    const resolved = resolveAppEnv(baseEnv);

    expect(resolved.NODE_ENV).toBe('development');
    expect(resolved.PORT).toBe(3000);
    expect(resolved.DATABASE_URL).toContain('postgresql://');
    expect(resolved.AUTH0_DOMAIN).toBe('tenant.us.auth0.com');
    expect(resolved.AUTH0_ISSUER).toBe('https://tenant.us.auth0.com/');
    expect(resolved.AUTH0_CLIENT_ID).toBe('client-id');
    expect(resolved.AUTH0_CLIENT_SECRET).toBe('client-secret');
    expect(resolved.AUTH0_AUDIENCE).toBe('https://api.be-capstone.local');
    expect(resolved.AUTH0_REDIRECT_URI).toBe(
      'http://localhost:3000/auth/callback',
    );
    expect(resolved.AUTH0_LOGOUT_RETURN_URL).toBe('http://localhost:5173');
    expect(resolved.sessionCookieSecure).toBe(false);
  });

  it('should normalize AUTH0_DOMAIN by stripping protocol and trailing slash', () => {
    const resolved = resolveAppEnv({
      ...baseEnv,
      AUTH0_DOMAIN: 'https://tenant.us.auth0.com/',
    });
    expect(resolved.AUTH0_DOMAIN).toBe('tenant.us.auth0.com');
    expect(resolved.AUTH0_ISSUER).toBe('https://tenant.us.auth0.com/');
  });

  it('should default sessionCookieSecure to true in production when unset', () => {
    const resolved = resolveAppEnv({
      ...baseEnv,
      NODE_ENV: 'production',
    });
    expect(resolved.sessionCookieSecure).toBe(true);
  });

  it('should parse SESSION_COOKIE_SECURE', () => {
    const resolved = resolveAppEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'false',
    });
    expect(resolved.sessionCookieSecure).toBe(false);
  });

  it('should respect explicit AUTH0_LOGOUT_RETURN_URL when provided', () => {
    const resolved = resolveAppEnv({
      ...baseEnv,
      AUTH0_LOGOUT_RETURN_URL: 'http://localhost:5173/goodbye',
    });
    expect(resolved.AUTH0_LOGOUT_RETURN_URL).toBe(
      'http://localhost:5173/goodbye',
    );
  });

  it('should throw when port is not a number', () => {
    expect(() =>
      resolveAppEnv({
        ...baseEnv,
        PORT: 'not-a-number',
      }),
    ).toThrow('PORT must be a number');
  });
});
