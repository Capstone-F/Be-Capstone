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

  /** Auth0 tenant domain (no protocol, no trailing slash), e.g. dev-xyz.us.auth0.com. */
  get auth0Domain(): string {
    return this.env.AUTH0_DOMAIN;
  }

  /** Auth0 issuer URL with trailing slash, e.g. https://dev-xyz.us.auth0.com/ */
  get auth0Issuer(): string {
    return this.env.AUTH0_ISSUER;
  }

  get auth0ClientId(): string {
    return this.env.AUTH0_CLIENT_ID;
  }

  get auth0ClientSecret(): string {
    return this.env.AUTH0_CLIENT_SECRET;
  }

  get auth0Audience(): string {
    return this.env.AUTH0_AUDIENCE;
  }

  get auth0RedirectUri(): string {
    return this.env.AUTH0_REDIRECT_URI;
  }

  get auth0LogoutReturnUrl(): string {
    return this.env.AUTH0_LOGOUT_RETURN_URL;
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
