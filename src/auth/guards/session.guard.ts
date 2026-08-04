import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const bearer = this.extractBearerToken(request);

    if (bearer) {
      request.authContext =
        await this.authService.authenticateBearerToken(bearer);
      return true;
    }

    const session = request.session;
    if (session?.userId) {
      await this.authService.refreshTokenIfNeeded(session);
      return true;
    }

    if (isPublic) {
      return true;
    }

    throw new UnauthorizedException('Not authenticated');
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || typeof header !== 'string') {
      return null;
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }
}
