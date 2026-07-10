import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthService } from '../auth.service';
import { AuthContext } from '../auth-context';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service';
import { UsersService } from '../../users/users.service';
import { filterAppRoles } from '../roles.enum';

@Injectable()
export class SessionGuard implements CanActivate {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly keycloakAdmin: KeycloakAdminService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const bearer = this.extractBearerToken(request);

    if (bearer) {
      await this.authenticateBearer(request, bearer);
      return true;
    }

    const session = request.session;
    if (!session?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    await this.authService.refreshTokenIfNeeded(session);
    return true;
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

  private getJwks() {
    if (!this.jwks) {
      const jwksUrl = new URL(
        `${this.keycloakAdmin.getPublicIssuer()}/protocol/openid-connect/certs`,
      );
      this.jwks = createRemoteJWKSet(jwksUrl);
    }
    return this.jwks;
  }

  private async authenticateBearer(
    request: Request,
    token: string,
  ): Promise<void> {
    try {
      const { payload } = await jwtVerify(token, this.getJwks(), {
        issuer: this.keycloakAdmin.getPublicIssuer(),
      });

      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) {
        throw new UnauthorizedException('Invalid access token');
      }

      const user = await this.usersService.findByKeycloakSub(sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const realmAccess = payload.realm_access as
        | { roles?: string[] }
        | undefined;
      const roles = filterAppRoles(realmAccess?.roles ?? []);

      const authContext: AuthContext = {
        userId: user.id,
        keycloakSub: user.keycloakSub,
        roles,
        clinicId: user.clinicId ?? null,
      };
      request.authContext = authContext;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
