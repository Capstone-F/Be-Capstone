import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { AuthService } from '../auth.service';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service';
import { UsersService } from '../../users/users.service';
import { jwtVerify } from 'jose';

describe('SessionGuard', () => {
  const authService = {
    refreshTokenIfNeeded: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;

  const keycloakAdmin = {
    getPublicIssuer: jest.fn(() => 'http://localhost:8080/realms/be-capstone'),
    extractRolesFromToken: jest.fn(() => ['customer']),
  } as unknown as jest.Mocked<KeycloakAdminService>;

  const usersService = {
    findByKeycloakSub: jest.fn(),
  } as unknown as jest.Mocked<UsersService>;

  const guard = new SessionGuard(authService, keycloakAdmin, usersService);

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow session cookie path', async () => {
    const request = {
      headers: {},
      session: { userId: 'u1' },
    };
    authService.refreshTokenIfNeeded.mockResolvedValue(undefined);

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(authService.refreshTokenIfNeeded).toHaveBeenCalledWith(
      request.session,
    );
  });

  it('should reject when no session and no bearer', async () => {
    const request = { headers: {}, session: {} };
    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should authenticate valid Bearer token', async () => {
    (jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'kc-sub-1',
        realm_access: { roles: ['customer'] },
      },
    });
    usersService.findByKeycloakSub.mockResolvedValue({
      id: 'u1',
      keycloakSub: 'kc-sub-1',
      clinicId: null,
    } as any);

    const request: any = {
      headers: { authorization: 'Bearer good.jwt.token' },
      session: {},
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.authContext).toEqual({
      userId: 'u1',
      keycloakSub: 'kc-sub-1',
      roles: ['customer'],
      clinicId: null,
    });
  });

  it('should reject invalid Bearer token', async () => {
    (jwtVerify as jest.Mock).mockRejectedValue(new Error('bad sig'));

    const request = {
      headers: { authorization: 'Bearer bad.token' },
      session: {},
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
