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
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
};

const DEV_TEST_USERNAME = 'dev-test';
const DEV_TEST_PASSWORD = 'dev-test';
const DEV_TEST_EMAIL = 'dev-test@dev.local';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Build the Keycloak authorization URL and return a random `state` for CSRF.
   */
  buildLoginUrl(idpHint?: string): { url: string; state: string } {
    const endpoint = `${this.getPublicIssuer()}/protocol/openid-connect/auth`;
    const state = randomUUID();
    const url = new URL(endpoint);
    url.searchParams.set('client_id', this.config.keycloakClientId);
    url.searchParams.set('redirect_uri', this.config.keycloakRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);

    if (idpHint) {
      url.searchParams.set('kc_idp_hint', idpHint);
    }

    return { url: url.toString(), state };
  }

  /**
   * Exchange an authorization code with Keycloak and upsert the local user.
   * Returns everything needed to populate the session.
   */
  async exchangeCodeAndUpsertUser(code: string, idpHint?: string) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.keycloakRedirectUri,
    });

    const token = await this.postForm<TokenResponse>(
      this.getTokenEndpoint(),
      params,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak returned a token response without access_token',
      );
    }

    const profile = this.decodeJwtPayload(token.id_token ?? token.access_token);

    const { user, isNewUser } = await this.usersService.upsertFromKeycloak(
      profile,
      idpHint ?? 'keycloak',
    );

    const tokenExpiresAt = Date.now() + (token.expires_in - 30) * 1000;

    return {
      user,
      isNewUser,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      tokenExpiresAt,
      idpHint: idpHint ?? 'keycloak',
    };
  }

  /**
   * If the access token stored in the session is near expiry, refresh it
   * via Keycloak and update the session in-place.
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
   * Revoke the refresh token on Keycloak side.
   */
  async revokeToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const params = new URLSearchParams({ refresh_token: refreshToken });
    try {
      await this.postForm(this.getLogoutEndpoint(), params);
    } catch (err) {
      this.logger.warn('Keycloak token revocation failed (non-fatal)', err);
    }
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

  /**
   * Development only: ensure dev-test user exists in Keycloak, log in via ROPC,
   * upsert local user. Returns session fields (same shape as OAuth callback).
   */
  async devCreateSessionForTestUser() {
    const adminToken = await this.getKeycloakAdminToken();
    await this.ensureClientDirectAccessGrantsEnabled(adminToken);
    await this.ensureDevTestUserExists(adminToken);

    const params = new URLSearchParams({
      grant_type: 'password',
      username: DEV_TEST_USERNAME,
      password: DEV_TEST_PASSWORD,
      scope: 'openid profile email',
    });

    const token = await this.postForm<TokenResponse>(
      this.getTokenEndpoint(),
      params,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak returned a token response without access_token',
      );
    }

    const profile = this.decodeJwtPayload(token.id_token ?? token.access_token);

    const { user, isNewUser } = await this.usersService.upsertFromKeycloak(
      profile,
      'dev',
    );

    const tokenExpiresAt = Date.now() + (token.expires_in - 30) * 1000;

    return {
      user,
      isNewUser,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      tokenExpiresAt,
      idpHint: 'dev',
      username: DEV_TEST_USERNAME,
      email: DEV_TEST_EMAIL,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────

  private async ensureDevTestUserExists(adminToken: string): Promise<void> {
    const existing = await this.adminFindUsersByUsername(
      adminToken,
      DEV_TEST_USERNAME,
    );

    if (existing.length > 0) {
      return;
    }

    this.logger.log(
      `Creating Keycloak dev user "${DEV_TEST_USERNAME}" in realm ${this.config.keycloakRealm}`,
    );

    await this.adminCreateUser(adminToken, {
      username: DEV_TEST_USERNAME,
      email: DEV_TEST_EMAIL,
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: DEV_TEST_PASSWORD,
          temporary: false,
        },
      ],
    });
  }

  private async ensureClientDirectAccessGrantsEnabled(
    adminToken: string,
  ): Promise<void> {
    const client = await this.adminGetClientByClientId(
      adminToken,
      this.config.keycloakClientId,
    );

    if (client.directAccessGrantsEnabled === true) {
      return;
    }

    this.logger.warn(
      `Keycloak client "${this.config.keycloakClientId}" has direct grants disabled; enabling for dev session endpoint`,
    );

    await this.adminUpdateClient(adminToken, client.id, {
      directAccessGrantsEnabled: true,
    });
  }

  private async getKeycloakAdminToken(): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.config.keycloakAdminUser,
      password: this.config.keycloakAdminPassword,
    });

    const token = await this.postForm<TokenResponse>(
      `${this.getInternalKeycloakBase()}/realms/master/protocol/openid-connect/token`,
      params,
      false,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak admin login failed (no access_token)',
      );
    }

    return token.access_token;
  }

  private async adminFindUsersByUsername(
    adminToken: string,
    username: string,
  ): Promise<Array<{ id: string }>> {
    const url = new URL(
      `${this.getInternalKeycloakBase()}/admin/realms/${this.config.keycloakRealm}/users`,
    );
    url.searchParams.set('username', username);
    url.searchParams.set('exact', 'true');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin user lookup failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as Array<{ id: string }>;
  }

  private async adminCreateUser(
    adminToken: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const url = `${this.getInternalKeycloakBase()}/admin/realms/${this.config.keycloakRealm}/users`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 201 || response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin user create failed (${response.status}): ${message}`,
    );
  }

  private async adminGetClientByClientId(
    adminToken: string,
    clientId: string,
  ): Promise<{ id: string; directAccessGrantsEnabled?: boolean }> {
    const url = new URL(
      `${this.getInternalKeycloakBase()}/admin/realms/${this.config.keycloakRealm}/clients`,
    );
    url.searchParams.set('clientId', clientId);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin client lookup failed (${response.status}): ${message}`,
      );
    }

    const clients = (await response.json()) as Array<{
      id: string;
      clientId: string;
      directAccessGrantsEnabled?: boolean;
    }>;
    const client = clients.find((item) => item.clientId === clientId);

    if (!client) {
      throw new BadGatewayException(
        `Keycloak client "${clientId}" not found in realm "${this.config.keycloakRealm}"`,
      );
    }

    return {
      id: client.id,
      directAccessGrantsEnabled: client.directAccessGrantsEnabled,
    };
  }

  private async adminUpdateClient(
    adminToken: string,
    clientUuid: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const url = `${this.getInternalKeycloakBase()}/admin/realms/${this.config.keycloakRealm}/clients/${clientUuid}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin client update failed (${response.status}): ${message}`,
    );
  }

  private getInternalKeycloakBase(): string {
    const raw = this.config.keycloakInternalUrl;
    const base =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return base.replace(/\/+$/, '');
  }

  private normalizeBase(raw: string): string {
    const base =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return `${base.replace(/\/+$/, '')}/realms/${this.config.keycloakRealm}`;
  }

  /** Issuer URL for browser-facing redirects (uses public hostname). */
  private getPublicIssuer(): string {
    return this.normalizeBase(this.config.keycloakPublicUrl);
  }

  /** Issuer URL for server-to-server calls (uses Docker-internal hostname). */
  private getInternalIssuer(): string {
    return this.normalizeBase(this.config.keycloakInternalUrl);
  }

  private getTokenEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/token`;
  }

  private getLogoutEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/logout`;
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
      form.set('client_id', this.config.keycloakClientId);
      if (this.config.keycloakClientSecret) {
        form.set('client_secret', this.config.keycloakClientSecret);
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
        `Keycloak request failed (${response.status}): ${message}`,
      );
    }

    const rawBody = await response.text();
    if (!rawBody) {
      return {} as T;
    }

    return JSON.parse(rawBody) as T;
  }
}
