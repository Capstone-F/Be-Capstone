import {
  ENV_DEFINITIONS,
  getMissingRequiredEnv,
  resolveAppEnv,
} from './env.config';

describe('env.config', () => {
  it('should define expected tracked env keys', () => {
    expect(Object.keys(ENV_DEFINITIONS)).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'KEYCLOAK_PUBLIC_URL',
        'KEYCLOAK_INTERNAL_URL',
        'KEYCLOAK_HEALTH_URL',
        'KEYCLOAK_REALM',
        'KEYCLOAK_CLIENT_ID',
        'KEYCLOAK_CLIENT_SECRET',
        'KEYCLOAK_REDIRECT_URI',
        'REDIS_URL',
        'SESSION_SECRET',
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

    expect(missing).toEqual(expect.arrayContaining(['DATABASE_URL', 'KEYCLOAK_PUBLIC_URL', 'SESSION_SECRET', 'FRONTEND_URL']));
  });

  it('should resolve env with defaults', () => {
    const resolved = resolveAppEnv({
      DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
      KEYCLOAK_PUBLIC_URL: 'http://localhost:8080',
      SESSION_SECRET: 'test-secret',
      FRONTEND_URL: 'http://localhost:5173',
    });

    expect(resolved.NODE_ENV).toBe('development');
    expect(resolved.PORT).toBe(3000);
    expect(resolved.DATABASE_URL).toContain('postgresql://');
    expect(resolved.KEYCLOAK_PUBLIC_URL).toBe('http://localhost:8080');
    expect(resolved.KEYCLOAK_INTERNAL_URL).toBe('http://localhost:8080');
    expect(resolved.KEYCLOAK_HEALTH_URL).toBe('http://localhost:9000/health/ready');
    expect(resolved.KEYCLOAK_REALM).toBe('be-capstone');
    expect(resolved.KEYCLOAK_CLIENT_ID).toBe('be-capstone-api');
    expect(resolved.KEYCLOAK_CLIENT_SECRET).toBe('be-capstone-secret');
    expect(resolved.KEYCLOAK_REDIRECT_URI).toBe(
      'http://localhost:3000/auth/callback',
    );
  });

  it('should use KEYCLOAK_INTERNAL_URL when provided', () => {
    const resolved = resolveAppEnv({
      DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
      KEYCLOAK_PUBLIC_URL: 'http://localhost:8080',
      KEYCLOAK_INTERNAL_URL: 'http://keycloak:8080',
      SESSION_SECRET: 'test-secret',
      FRONTEND_URL: 'http://localhost:5173',
    });

    expect(resolved.KEYCLOAK_PUBLIC_URL).toBe('http://localhost:8080');
    expect(resolved.KEYCLOAK_INTERNAL_URL).toBe('http://keycloak:8080');
    expect(resolved.KEYCLOAK_HEALTH_URL).toBe('http://keycloak:9000/health/ready');
  });

  it('should throw when port is not a number', () => {
    expect(() =>
      resolveAppEnv({
        PORT: 'not-a-number',
        DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
        KEYCLOAK_PUBLIC_URL: 'http://localhost:8080',
        SESSION_SECRET: 'test-secret',
        FRONTEND_URL: 'http://localhost:5173',
      }),
    ).toThrow('PORT must be a number');
  });
});
