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

  /** Single Keycloak base URL used for both browser redirects and server calls. */
  get keycloakUrl(): string {
    return this.env.KEYCLOAK_URL;
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

  getMissingRequiredKeys(): string[] {
    return getMissingRequiredEnv();
  }
}
