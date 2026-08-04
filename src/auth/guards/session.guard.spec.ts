import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionGuard } from './session.guard';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('SessionGuard', () => {
  const authService = {
    refreshTokenIfNeeded: jest.fn(),
    authenticateBearerToken: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;

  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new SessionGuard(authService, reflector);

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
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
    expect(authService.authenticateBearerToken).not.toHaveBeenCalled();
  });

  it('should reject when no session and no bearer', async () => {
    const request = { headers: {}, session: {} };
    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should allow unauthenticated access on @Public routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      return false;
    });
    const request = { headers: {}, session: {} };
    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
  });

  it('should authenticate valid Bearer token', async () => {
    authService.authenticateBearerToken.mockResolvedValue({
      userId: 'u1',
      keycloakSub: 'kc-sub-1',
      roles: ['customer'],
      clinicId: null,
    });

    const request: any = {
      headers: { authorization: 'Bearer good.jwt.token' },
      session: {},
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(authService.authenticateBearerToken).toHaveBeenCalledWith(
      'good.jwt.token',
    );
    expect(request.authContext).toEqual({
      userId: 'u1',
      keycloakSub: 'kc-sub-1',
      roles: ['customer'],
      clinicId: null,
    });
  });

  it('should reject invalid Bearer token', async () => {
    authService.authenticateBearerToken.mockRejectedValue(
      new UnauthorizedException('Invalid or expired access token'),
    );

    const request = {
      headers: { authorization: 'Bearer bad.token' },
      session: {},
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
