import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { UsersService } from '../users/users.service';
import { APP_ROLES, filterAppRoles } from './roles.enum';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  /**
   * Build the Keycloak authorization URL and return a random `state` for CSRF.
   * Pass `stateOverride` when the caller already persisted state (e.g. mobile Redis).
   */
  buildLoginUrl(
    idpHint?: string,
    stateOverride?: string,
  ): { url: string; state: string } {
    const endpoint = `${this.keycloakAdmin.getPublicIssuer()}/protocol/openid-connect/auth`;
    const state = stateOverride ?? randomUUID();
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

    const token = await this.keycloakAdmin.postForm<TokenResponse>(
      this.keycloakAdmin.getTokenEndpoint(),
      params,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak returned a token response without access_token',
      );
    }

    const result = await this.buildSessionFromToken(
      token,
      idpHint ?? 'keycloak',
    );
    return { ...result, idpHint: idpHint ?? 'keycloak' };
  }

  /**
   * Authenticate an end user via Keycloak ROPC (password grant),
   * upsert the local DB row, and return tokens + user profile.
   */
  async loginWithPassword(username: string, password: string) {
    const token = await this.keycloakAdmin.requestPasswordGrant(
      username,
      password,
    );

    const result = await this.buildSessionFromToken(token, 'keycloak');
    if (!result.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const profile = await this.usersService.getOwnProfile(result.user.id);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: token.expires_in,
      user: profile,
      isNewUser: result.isNewUser,
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

    try {
      const refreshed = await this.refreshWithToken(session.refreshToken);
      session.accessToken = refreshed.accessToken;
      session.refreshToken = refreshed.refreshToken;
      session.tokenExpiresAt = refreshed.tokenExpiresAt;
      session.roles = refreshed.roles;
    } catch (err) {
      this.logger.warn('Session token refresh failed — forcing re-login', err);
      throw new UnauthorizedException('Session expired, please login again');
    }
  }

  /**
   * Refresh Keycloak tokens using a refresh_token grant (mobile / public API).
   */
  async refreshWithToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenExpiresAt: number;
    roles: string[];
  }> {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('refreshToken is required');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    try {
      const token = await this.keycloakAdmin.postForm<TokenResponse>(
        this.keycloakAdmin.getTokenEndpoint(),
        params,
      );

      if (!token.access_token) {
        throw new UnauthorizedException('Token refresh failed');
      }

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? refreshToken,
        expiresIn: token.expires_in,
        tokenExpiresAt: Date.now() + (token.expires_in - 30) * 1000,
        roles: filterAppRoles(
          this.keycloakAdmin.extractRolesFromToken(token.access_token),
        ),
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn('Keycloak refresh_token grant failed', err);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Revoke the refresh token on Keycloak side.
   */
  async revokeToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const params = new URLSearchParams({ refresh_token: refreshToken });
    try {
      await this.keycloakAdmin.postForm(
        this.keycloakAdmin.getLogoutEndpoint(),
        params,
      );
    } catch (err) {
      this.logger.warn('Keycloak token revocation failed (non-fatal)', err);
    }
  }

  /**
   * Resolve client_redirect_uri for web (FRONTEND_URL origin) or mobile
   * (exact match against MOBILE_REDIRECT_URIS whitelist).
   */
  resolveClientRedirect(raw: string | undefined): {
    uri: string;
    flow: 'web' | 'mobile';
  } {
    if (!raw?.trim()) {
      throw new BadRequestException('client_redirect_uri is required');
    }

    const trimmed = raw.trim();
    const mobileAllowed = this.config.mobileRedirectUris;
    if (mobileAllowed.includes(trimmed)) {
      return { uri: trimmed, flow: 'mobile' };
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new BadRequestException('Invalid client_redirect_uri');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException(
        'client_redirect_uri must use http or https, or a whitelisted mobile deep link',
      );
    }

    const allowed = new URL(this.config.frontendUrl);
    if (url.origin !== allowed.origin) {
      throw new BadRequestException(
        'client_redirect_uri origin must match FRONTEND_URL',
      );
    }

    return { uri: url.toString(), flow: 'web' };
  }

  /**
   * Ensures `client_redirect_uri` is a safe post-login URL: http(s) and same
   * origin as FRONTEND_URL (open redirect protection).
   * @deprecated Prefer resolveClientRedirect for web+mobile support.
   */
  validateClientRedirectUri(raw: string | undefined): string {
    const resolved = this.resolveClientRedirect(raw);
    if (resolved.flow !== 'web') {
      throw new BadRequestException(
        'client_redirect_uri must use http or https',
      );
    }
    return resolved.uri;
  }

  /** Build `/auth/error?reason=` on the same origin as the given base URL. */
  authErrorUrl(frontendBaseUrl: string, reason: string): string {
    const u = new URL(frontendBaseUrl);
    return `${u.origin}/auth/error?reason=${encodeURIComponent(reason)}`;
  }

  /** Build deep-link error redirect for mobile: `{deepLink}?error=reason`. */
  mobileErrorRedirectUrl(deepLink: string, reason: string): string {
    const separator = deepLink.includes('?') ? '&' : '?';
    return `${deepLink}${separator}error=${encodeURIComponent(reason)}`;
  }

  /**
   * Development only: log in as realm App Admin via ROPC, upsert local user.
   * Returns session fields (same shape as OAuth callback).
   */
  async devCreateSessionForAdmin() {
    const adminToken = await this.keycloakAdmin.getAdminToken();
    await this.ensureClientDirectAccessGrantsEnabled(adminToken);

    const token = await this.keycloakAdmin.requestPasswordGrant(
      this.config.keycloakDevAdminUser,
      this.config.keycloakDevAdminPassword,
    );

    const result = await this.buildSessionFromToken(token, 'dev');

    const profile = this.keycloakAdmin.decodeJwtPayload(
      token.id_token ?? token.access_token,
    );
    const username =
      (profile.preferred_username as string | undefined) ??
      this.config.keycloakDevAdminUser;
    const email =
      (profile.email as string | undefined) ??
      `${this.config.keycloakDevAdminUser}@dev.local`;

    return {
      ...result,
      idpHint: 'dev',
      username,
      email,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────

  private async buildSessionFromToken(token: TokenResponse, provider: string) {
    const profile = this.keycloakAdmin.decodeJwtPayload(
      token.id_token ?? token.access_token,
    );
    const roles = filterAppRoles(
      this.keycloakAdmin.extractRolesFromToken(token.access_token),
    );

    const { user, isNewUser } = await this.usersService.upsertFromKeycloak(
      profile,
      provider,
      roles,
    );

    const tokenExpiresAt = Date.now() + (token.expires_in - 30) * 1000;

    return {
      user,
      isNewUser,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      tokenExpiresAt,
      roles,
    };
  }

  private async ensureClientDirectAccessGrantsEnabled(
    adminToken: string,
  ): Promise<void> {
    const client = await this.keycloakAdmin.getClientByClientId(
      adminToken,
      this.config.keycloakClientId,
    );

    if (client.directAccessGrantsEnabled === true) {
      return;
    }

    this.logger.warn(
      `Keycloak client "${this.config.keycloakClientId}" has direct grants disabled; enabling for dev session endpoint`,
    );

    await this.keycloakAdmin.updateClient(adminToken, client.id, {
      directAccessGrantsEnabled: true,
    });
  }
}

export { APP_ROLES };
