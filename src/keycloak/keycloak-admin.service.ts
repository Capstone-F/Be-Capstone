import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
        'Đăng nhập admin Keycloak thất bại (không có access_token)',
      );
    }

    return token.access_token;
  }

  /**
   * ROPC grant for end-user login. Returns raw Keycloak token response.
   * Maps Keycloak 401/400 to UnauthorizedException with a generic message.
   */
  async requestPasswordGrant(
    username: string,
    password: string,
  ): Promise<TokenResponse> {
    const form = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      scope: 'openid profile email',
      client_id: this.config.keycloakClientId,
    });
    if (this.config.keycloakClientSecret) {
      form.set('client_secret', this.config.keycloakClientSecret);
    }

    const response = await fetch(this.getTokenEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (response.status === 401 || response.status === 400) {
      throw new UnauthorizedException(
        'Tên đăng nhập hoặc mật khẩu không hợp lệ',
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Cấp quyền bằng mật khẩu Keycloak thất bại (${response.status}): ${message}`,
      );
    }

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token) {
      throw new BadGatewayException(
        'Keycloak trả về phản hồi token mà không có access_token',
      );
    }

    return token;
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
        `Tra cứu người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Liệt kê người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Lấy thông tin người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
        'Đã tạo người dùng Keycloak nhưng thiếu Location header',
      );
    }

    if (response.status === 204) {
      throw new BadGatewayException(
        'Đã tạo người dùng Keycloak nhưng không trả về user id',
      );
    }

    if (response.status === 409) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const message = await response.text();
    throw new BadGatewayException(
      `Tạo người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
      `Cập nhật trạng thái kích hoạt người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
      `Cập nhật người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Lấy vai trò admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Lấy vai trò người dùng admin Keycloak thất bại (${response.status}): ${message}`,
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
      `Gán vai trò admin Keycloak thất bại (${response.status}): ${message}`,
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
      `Gỡ vai trò admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Tra cứu client admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Không tìm thấy client Keycloak "${clientId}" trong realm "${this.config.keycloakRealm}"`,
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
      `Cập nhật client admin Keycloak thất bại (${response.status}): ${message}`,
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
        `Yêu cầu tới Keycloak thất bại (${response.status}): ${message}`,
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
      throw new BadGatewayException('Token không hợp lệ hoặc bị lỗi định dạng');
    }
  }

  extractRolesFromToken(token: string): string[] {
    const payload = this.decodeJwtPayload(token);
    const realmAccess = payload.realm_access as
      { roles?: string[] } | undefined;
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
