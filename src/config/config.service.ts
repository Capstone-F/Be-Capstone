import { Injectable } from '@nestjs/common';
import { AppEnv, getMissingRequiredEnv, resolveAppEnv } from './env.config';

@Injectable()
export class AppConfigService {
  private readonly env: AppEnv;

  constructor() {
    this.env = resolveAppEnv();
  }

  get nodeEnv(): string {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  /** Public Keycloak URL reachable by the browser (login page redirects). */
  get keycloakPublicUrl(): string {
    return this.env.KEYCLOAK_PUBLIC_URL;
  }

  /** Internal Keycloak URL for server-to-server calls (token exchange, etc.). */
  get keycloakInternalUrl(): string {
    return this.env.KEYCLOAK_INTERNAL_URL;
  }

  get keycloakHealthUrl(): string {
    return this.env.KEYCLOAK_HEALTH_URL;
  }

  get keycloakRealm(): string {
    return this.env.KEYCLOAK_REALM;
  }

  get keycloakClientId(): string {
    return this.env.KEYCLOAK_CLIENT_ID;
  }

  get keycloakClientSecret(): string {
    return this.env.KEYCLOAK_CLIENT_SECRET;
  }

  get keycloakRedirectUri(): string {
    return this.env.KEYCLOAK_REDIRECT_URI;
  }

  get keycloakAdminUser(): string {
    return this.env.KEYCLOAK_ADMIN_USER;
  }

  get keycloakAdminPassword(): string {
    return this.env.KEYCLOAK_ADMIN_PASSWORD;
  }

  get keycloakDevAdminUser(): string {
    return this.env.KEYCLOAK_DEV_ADMIN_USER;
  }

  get keycloakDevAdminPassword(): string {
    return this.env.KEYCLOAK_DEV_ADMIN_PASSWORD;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get sessionSecret(): string {
    return this.env.SESSION_SECRET;
  }

  /**
   * Secure session cookie (HTTPS). When true on plain HTTP, express-session omits Set-Cookie.
   * Override with SESSION_COOKIE_SECURE=false for HTTP deployments (e.g. local compose).
   */
  get sessionCookieSecure(): boolean {
    return this.env.sessionCookieSecure;
  }

  get frontendUrl(): string {
    return this.env.FRONTEND_URL;
  }

  get corsOrigin(): string {
    return this.env.CORS_ORIGIN;
  }

  getMissingRequiredKeys(): string[] {
    return getMissingRequiredEnv();
  }
}
