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

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get sessionSecret(): string {
    return this.env.SESSION_SECRET;
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
