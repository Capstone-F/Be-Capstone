import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';
import { Role } from '../roles.enum';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  const buildContext = (session: {
    userId?: string;
    roles?: string[];
  }): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          session: { userId: 'u1', ...session },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  afterEach(() => jest.clearAllMocks());

  it('should allow when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(buildContext({ roles: [Role.Customer] }))).toBe(
      true,
    );
  });

  it('should allow when user has a required role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.AppAdmin, Role.Staff]);

    expect(
      guard.canActivate(buildContext({ roles: [Role.Staff, Role.Customer] })),
    ).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('should deny when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.AppAdmin]);

    expect(() =>
      guard.canActivate(buildContext({ roles: [Role.Customer] })),
    ).toThrow(ForbiddenException);
  });

  it('should allow unauthenticated callers on @Public routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === ROLES_KEY) return [Role.Customer];
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ session: {} }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext),
    ).toBe(true);
  });

  it('should still enforce roles when authenticated on @Public routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === ROLES_KEY) return [Role.Customer];
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    expect(() =>
      guard.canActivate(buildContext({ roles: [Role.Staff] })),
    ).toThrow(ForbiddenException);
  });
});
