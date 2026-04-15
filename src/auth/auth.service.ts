import {
  BadGatewayException,
  Injectable,
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
  constructor(
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Returns OIDC endpoint URLs built from the PUBLIC Keycloak URL.
   * These URLs are safe to return to browsers and frontend clients.
   */
  getOidcEndpoints(): OidcEndpoints {
    const issuer = this.getPublicIssuer();
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
    const issuer = this.getPublicIssuer();
    const authorizationEndpoint = `${issuer}/protocol/openid-connect/auth`;
    const state = randomUUID();
    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', this.config.keycloakClientId);
    url.searchParams.set('redirect_uri', redirectUri ?? this.config.keycloakRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);

    // kc_idp_hint skips the Keycloak login page and goes directly to the IDP
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
      this.getInternalTokenEndpoint(),
      params,
    );
    const profile = await this.getUserInfo(token.access_token);
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
    return this.postForm<TokenResponse>(this.getInternalTokenEndpoint(), params);
  }

  async logout(refreshToken: string) {
    const params = new URLSearchParams({ refresh_token: refreshToken });
    await this.postForm(this.getInternalLogoutEndpoint(), params);
    return { success: true };
  }

  async getUserInfo(accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch(this.getInternalUserInfoEndpoint(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Unable to fetch user profile from Keycloak');
    }

    return (await response.json()) as Record<string, unknown>;
  }

  /**
   * Internal issuer — uses KEYCLOAK_URL (Docker service name / private host).
   * Only used for direct server-to-server calls (token, userinfo, logout).
   */
  private getInternalIssuer(): string {
    return this.buildIssuer(this.config.keycloakUrl);
  }

  /**
   * Public issuer — uses KEYCLOAK_PUBLIC_URL (externally reachable host).
   * Used when building URLs returned to browsers/frontends.
   */
  private getPublicIssuer(): string {
    return this.buildIssuer(this.config.keycloakPublicUrl);
  }

  private buildIssuer(baseUrl: string): string {
    const raw = baseUrl.trim();
    const normalized =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return `${normalized.replace(/\/+$/, '')}/realms/${this.config.keycloakRealm}`;
  }

  private getInternalTokenEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/token`;
  }

  private getInternalLogoutEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/logout`;
  }

  private getInternalUserInfoEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/userinfo`;
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
