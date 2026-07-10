import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getAuthContext } from '../auth-context';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { hasAnyRole, Role } from '../roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const auth = getAuthContext(request);
    const roles = auth?.roles;

    if (!hasAnyRole(roles, requiredRoles)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
