import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';
import { Role } from '../roles.enum';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  const buildContext = (session: { roles?: string[] }): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ session }),
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
});
