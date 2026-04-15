import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
};

type OidcEndpoints = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri: string;
  logoutEndpoint: string;
  introspectionEndpoint: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
  ) {}

  getOidcEndpoints(): OidcEndpoints {
    const issuer = this.getIssuer();
    return {
      issuer,
      authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
      userInfoEndpoint: `${issuer}/protocol/openid-connect/userinfo`,
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
      logoutEndpoint: `${issuer}/protocol/openid-connect/logout`,
      introspectionEndpoint: `${issuer}/protocol/openid-connect/token/introspect`,
    };
  }

  getLoginUrl(redirectUri?: string, idpHint?: string) {
    const authorizationEndpoint = `${this.getIssuer()}/protocol/openid-connect/auth`;
    const state = randomUUID();
    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', this.config.keycloakClientId);
    url.searchParams.set(
      'redirect_uri',
      redirectUri ?? this.config.keycloakRedirectUri,
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);

    if (idpHint) {
      url.searchParams.set('kc_idp_hint', idpHint);
    }

    return {
      authorizationUrl: url.toString(),
      state,
      redirectUri: redirectUri ?? this.config.keycloakRedirectUri,
      idpHint: idpHint ?? null,
    };
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUri?: string,
    codeVerifier?: string,
    idpHint?: string,
  ) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri ?? this.config.keycloakRedirectUri,
    });
    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const token = await this.postForm<TokenResponse>(
      this.getTokenEndpoint(),
      params,
    );

    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak returned a token response without access_token',
      );
    }

    const profile = this.decodeJwtPayload(
      token.id_token ?? token.access_token,
    );

    const { user, isNewUser } = await this.usersService.upsertFromKeycloak(
      profile,
      idpHint ?? 'keycloak',
    );

    return { token, profile, user, isNewUser };
  }

  async refreshToken(refreshToken: string) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return this.postForm<TokenResponse>(this.getTokenEndpoint(), params);
  }

  async logout(refreshToken: string) {
    const params = new URLSearchParams({ refresh_token: refreshToken });
    await this.postForm(this.getLogoutEndpoint(), params);
    return { success: true };
  }

  async getUserInfo(accessToken: string): Promise<Record<string, unknown>> {
    const url = `${this.getIssuer()}/protocol/openid-connect/userinfo`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new UnauthorizedException(
        `Keycloak userinfo failed (${response.status}): ${body || response.statusText}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  // ─── Private helpers ───────────────────────────────────────────

  private getIssuer(): string {
    const raw = this.config.keycloakUrl.trim();
    const base =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return `${base.replace(/\/+$/, '')}/realms/${this.config.keycloakRealm}`;
  }

  private getTokenEndpoint(): string {
    return `${this.getIssuer()}/protocol/openid-connect/token`;
  }

  private getLogoutEndpoint(): string {
    return `${this.getIssuer()}/protocol/openid-connect/logout`;
  }

  /**
   * Decode a JWT payload (base64url) without signature verification.
   * Safe because tokens come directly from Keycloak's token endpoint
   * (server-to-server) or are checked for expiry in getUserProfile.
   *
   * TODO: add JWKS-based signature verification for production.
   */
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
