import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import type { Request } from 'express';

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Build the Auth0 authorization URL and return a random `state` for CSRF.
   *
   * `idpHint` maps to Auth0's `connection` query param:
   *   - 'google' → 'google-oauth2' (standard Google social connection name)
   *   - any other value is passed through unchanged.
   */
  buildLoginUrl(idpHint?: string): { url: string; state: string } {
    const endpoint = `${this.config.auth0Issuer}authorize`;
    const state = randomUUID();
    const url = new URL(endpoint);
    url.searchParams.set('client_id', this.config.auth0ClientId);
    url.searchParams.set('redirect_uri', this.config.auth0RedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email offline_access');
    url.searchParams.set('audience', this.config.auth0Audience);
    url.searchParams.set('state', state);

    const connection = mapIdpHintToConnection(idpHint);
    if (connection) {
      url.searchParams.set('connection', connection);
    }

    return { url: url.toString(), state };
  }

  /**
   * Exchange an authorization code with Auth0 and upsert the local user.
   * Returns everything needed to populate the session.
   */
  async exchangeCodeAndUpsertUser(code: string, idpHint?: string) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.auth0RedirectUri,
    });

    const token = await this.postForm<TokenResponse>(
      this.getTokenEndpoint(),
      params,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Auth0 returned a token response without access_token',
      );
    }

    const profile = this.decodeJwtPayload(token.id_token ?? token.access_token);

    const { user, isNewUser } =
      await this.usersService.upsertFromAuth0(profile);

    const tokenExpiresAt = Date.now() + (token.expires_in - 30) * 1000;

    return {
      user,
      isNewUser,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      tokenExpiresAt,
      idpHint: idpHint ?? null,
    };
  }

  /**
   * If the access token stored in the session is near expiry, refresh it
   * via Auth0 and update the session in-place.
   */
  async refreshTokenIfNeeded(session: Request['session']): Promise<void> {
    if (!session.refreshToken) return;
    if (Date.now() < (session.tokenExpiresAt ?? 0)) return;

    this.logger.debug(`Refreshing token for user ${session.userId}`);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });

    try {
      const token = await this.postForm<TokenResponse>(
        this.getTokenEndpoint(),
        params,
      );

      session.accessToken = token.access_token;
      session.refreshToken = token.refresh_token ?? session.refreshToken;
      session.tokenExpiresAt = Date.now() + (token.expires_in - 30) * 1000;
    } catch (err) {
      this.logger.warn('Session token refresh failed — forcing re-login', err);
      throw new UnauthorizedException('Session expired, please login again');
    }
  }

  /**
   * Revoke the refresh token on Auth0 side. Best-effort; failures are logged
   * but never block local session destruction.
   */
  async revokeToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const params = new URLSearchParams({ token: refreshToken });
    try {
      await this.postForm(this.getRevokeEndpoint(), params);
    } catch (err) {
      this.logger.warn('Auth0 token revocation failed (non-fatal)', err);
    }
  }

  /**
   * Build the Auth0 v2/logout URL the browser must visit to terminate the
   * Auth0 SSO session and return to a known frontend URL.
   */
  buildLogoutUrl(returnTo?: string): string {
    const url = new URL(`${this.config.auth0Issuer}v2/logout`);
    url.searchParams.set('client_id', this.config.auth0ClientId);
    url.searchParams.set(
      'returnTo',
      returnTo?.trim() || this.config.auth0LogoutReturnUrl,
    );
    return url.toString();
  }

  async findUserById(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  /**
   * Ensures `client_redirect_uri` is a safe post-login URL: http(s) and same
   * origin as FRONTEND_URL (open redirect protection).
   */
  validateClientRedirectUri(raw: string | undefined): string {
    if (!raw?.trim()) {
      throw new BadRequestException('client_redirect_uri is required');
    }
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new BadRequestException('Invalid client_redirect_uri');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException(
        'client_redirect_uri must use http or https',
      );
    }
    const allowed = new URL(this.config.frontendUrl);
    if (url.origin !== allowed.origin) {
      throw new BadRequestException(
        'client_redirect_uri origin must match FRONTEND_URL',
      );
    }
    return url.toString();
  }

  /** Build `/auth/error?reason=` on the same origin as the given base URL. */
  authErrorUrl(frontendBaseUrl: string, reason: string): string {
    const u = new URL(frontendBaseUrl);
    return `${u.origin}/auth/error?reason=${encodeURIComponent(reason)}`;
  }

  // ─── Private helpers ───────────────────────────────────────────

  private getTokenEndpoint(): string {
    return `${this.config.auth0Issuer}oauth/token`;
  }

  private getRevokeEndpoint(): string {
    return `${this.config.auth0Issuer}oauth/revoke`;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Not a valid JWT (expected 3 parts)');
      }
      const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
      return JSON.parse(payload) as Record<string, unknown>;
    } catch (err) {
      this.logger.error('Failed to decode JWT payload', err);
      throw new UnauthorizedException('Invalid or malformed token');
    }
  }

  private async postForm<T = unknown>(
    url: string,
    form: URLSearchParams,
    attachClientCredentials = true,
  ): Promise<T> {
    if (attachClientCredentials) {
      form.set('client_id', this.config.auth0ClientId);
      if (this.config.auth0ClientSecret) {
        form.set('client_secret', this.config.auth0ClientSecret);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Auth0 request failed (${response.status}): ${message}`,
      );
    }

    const rawBody = await response.text();
    if (!rawBody) {
      return {} as T;
    }

    return JSON.parse(rawBody) as T;
  }
}

/**
 * Map a friendly idpHint into the Auth0 `connection` parameter.
 * - 'google' → 'google-oauth2' (the default Auth0 social connection name)
 * - falsy → undefined (Auth0 universal login picker)
 * - any other string is passed through unchanged so callers can request a
 *   specific Auth0 connection by name (e.g. 'github', 'Username-Password-Authentication').
 */
function mapIdpHintToConnection(idpHint?: string): string | undefined {
  if (!idpHint) return undefined;
  const trimmed = idpHint.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'google') return 'google-oauth2';
  return trimmed;
}
