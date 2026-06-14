import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
};

export type KeycloakUserSummary = {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
};

export type KeycloakRealmRole = {
  id: string;
  name: string;
  description?: string;
};

export type CreateKeycloakUserInput = {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  credentials?: Array<{
    type: string;
    value: string;
    temporary: boolean;
  }>;
  requiredActions?: string[];
};

export type ListKeycloakUsersQuery = {
  search?: string;
  first?: number;
  max?: number;
};

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  constructor(private readonly config: AppConfigService) {}

  async getAdminToken(): Promise<string> {
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

  async findUsersByUsername(
    adminToken: string,
    username: string,
  ): Promise<Array<{ id: string }>> {
    const url = new URL(`${this.getAdminRealmBase()}/users`);
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

  async listUsers(
    adminToken: string,
    query: ListKeycloakUsersQuery = {},
  ): Promise<KeycloakUserSummary[]> {
    const url = new URL(`${this.getAdminRealmBase()}/users`);
    if (query.search?.trim()) {
      url.searchParams.set('search', query.search.trim());
    }
    if (query.first !== undefined) {
      url.searchParams.set('first', String(query.first));
    }
    if (query.max !== undefined) {
      url.searchParams.set('max', String(query.max));
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin list users failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as KeycloakUserSummary[];
  }

  async getUser(
    adminToken: string,
    userId: string,
  ): Promise<KeycloakUserSummary> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin get user failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as KeycloakUserSummary;
  }

  async createUser(
    adminToken: string,
    body: CreateKeycloakUserInput,
  ): Promise<string> {
    const response = await fetch(`${this.getAdminRealmBase()}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 201) {
      const location = response.headers.get('Location');
      if (location) {
        const id = location.split('/').pop();
        if (id) {
          return id;
        }
      }
      throw new BadGatewayException(
        'Keycloak user created but Location header missing',
      );
    }

    if (response.status === 204) {
      throw new BadGatewayException(
        'Keycloak user created but no user id returned',
      );
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin user create failed (${response.status}): ${message}`,
    );
  }

  async setUserEnabled(
    adminToken: string,
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      },
    );

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin set user enabled failed (${response.status}): ${message}`,
    );
  }

  async updateUser(
    adminToken: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin update user failed (${response.status}): ${message}`,
    );
  }

  async setUserAttributes(
    adminToken: string,
    userId: string,
    attributes: Record<string, string[]>,
  ): Promise<void> {
    const existing = await this.getUser(adminToken, userId);
    await this.updateUser(adminToken, userId, {
      ...existing,
      attributes: {
        ...(existing.attributes ?? {}),
        ...attributes,
      },
    });
  }

  async getRealmRole(
    adminToken: string,
    roleName: string,
  ): Promise<KeycloakRealmRole> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/roles/${encodeURIComponent(roleName)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin get role failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as KeycloakRealmRole;
  }

  async getUserRealmRoles(
    adminToken: string,
    userId: string,
  ): Promise<KeycloakRealmRole[]> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}/role-mappings/realm`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Keycloak admin get user roles failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as KeycloakRealmRole[];
  }

  async assignRealmRoles(
    adminToken: string,
    userId: string,
    roles: KeycloakRealmRole[],
  ): Promise<void> {
    if (!roles.length) {
      return;
    }

    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}/role-mappings/realm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roles),
      },
    );

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin assign roles failed (${response.status}): ${message}`,
    );
  }

  async removeRealmRoles(
    adminToken: string,
    userId: string,
    roles: KeycloakRealmRole[],
  ): Promise<void> {
    if (!roles.length) {
      return;
    }

    const response = await fetch(
      `${this.getAdminRealmBase()}/users/${userId}/role-mappings/realm`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roles),
      },
    );

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin remove roles failed (${response.status}): ${message}`,
    );
  }

  async replaceUserAppRoles(
    adminToken: string,
    userId: string,
    targetRoleNames: string[],
    allAppRoleNames: string[],
  ): Promise<void> {
    const currentRoles = await this.getUserRealmRoles(adminToken, userId);
    const appRoleSet = new Set(allAppRoleNames);
    const currentAppRoles = currentRoles.filter((r) => appRoleSet.has(r.name));
    const targetRoles = await Promise.all(
      targetRoleNames.map((name) => this.getRealmRole(adminToken, name)),
    );

    const toRemove = currentAppRoles.filter(
      (r) => !targetRoleNames.includes(r.name),
    );
    const toAdd = targetRoles.filter(
      (r) => !currentAppRoles.some((c) => c.name === r.name),
    );

    await this.removeRealmRoles(adminToken, userId, toRemove);
    await this.assignRealmRoles(adminToken, userId, toAdd);
  }

  async getClientByClientId(
    adminToken: string,
    clientId: string,
  ): Promise<{ id: string; directAccessGrantsEnabled?: boolean }> {
    const url = new URL(`${this.getAdminRealmBase()}/clients`);
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

  async updateClient(
    adminToken: string,
    clientUuid: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const response = await fetch(
      `${this.getAdminRealmBase()}/clients/${clientUuid}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (response.status === 204) {
      return;
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Keycloak admin client update failed (${response.status}): ${message}`,
    );
  }

  async postForm<T = unknown>(
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

  getInternalIssuer(): string {
    return this.normalizeBase(this.config.keycloakInternalUrl);
  }

  getPublicIssuer(): string {
    return this.normalizeBase(this.config.keycloakPublicUrl);
  }

  getTokenEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/token`;
  }

  getLogoutEndpoint(): string {
    return `${this.getInternalIssuer()}/protocol/openid-connect/logout`;
  }

  decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Not a valid JWT (expected 3 parts)');
      }
      const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
      return JSON.parse(payload) as Record<string, unknown>;
    } catch (err) {
      this.logger.error('Failed to decode JWT payload', err);
      throw new BadGatewayException('Invalid or malformed token');
    }
  }

  extractRolesFromToken(token: string): string[] {
    const payload = this.decodeJwtPayload(token);
    const realmAccess = payload.realm_access as
      | { roles?: string[] }
      | undefined;
    return realmAccess?.roles ?? [];
  }

  private getInternalKeycloakBase(): string {
    const raw = this.config.keycloakInternalUrl;
    const base =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return base.replace(/\/+$/, '');
  }

  private getAdminRealmBase(): string {
    return `${this.getInternalKeycloakBase()}/admin/realms/${this.config.keycloakRealm}`;
  }

  private normalizeBase(raw: string): string {
    const base =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `http://${raw}`;
    return `${base.replace(/\/+$/, '')}/realms/${this.config.keycloakRealm}`;
  }
}
