import { AppConfigService } from './config.service';

describe('AppConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PORT: '4500',
      DATABASE_URL: 'postgresql://admin:admin@localhost:5432/be-capstone',
      KEYCLOAK_URL: 'http://localhost:8080',
      KEYCLOAK_HEALTH_URL: 'http://localhost:9000/health/ready',
      KEYCLOAK_REALM: 'be-capstone',
      KEYCLOAK_CLIENT_ID: 'be-capstone-api',
      KEYCLOAK_CLIENT_SECRET: 'be-capstone-secret',
      KEYCLOAK_REDIRECT_URI: 'http://localhost:3000/auth/callback',
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
    expect(service.keycloakUrl).toBe('http://localhost:8080');
    expect(service.keycloakRealm).toBe('be-capstone');
    expect(service.keycloakClientId).toBe('be-capstone-api');
    expect(service.keycloakClientSecret).toBe('be-capstone-secret');
    expect(service.keycloakRedirectUri).toBe('http://localhost:3000/auth/callback');
  });

  it('should expose keycloakHealthUrl from env', () => {
    const service = new AppConfigService();
    expect(service.keycloakHealthUrl).toBe('http://localhost:9000/health/ready');
  });

  it('should return no missing keys when env is complete', () => {
    const service = new AppConfigService();
    expect(service.getMissingRequiredKeys()).toHaveLength(0);
  });

  it('should throw if required env is missing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.KEYCLOAK_URL;

    expect(() => new AppConfigService()).toThrow(
      'Missing required environment variables',
    );
  });
});
