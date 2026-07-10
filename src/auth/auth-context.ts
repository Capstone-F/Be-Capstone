import type { Request } from 'express';

export type AuthContext = {
  userId: string;
  keycloakSub?: string;
  roles: string[];
  clinicId?: string | null;
};

declare module 'express-serve-static-core' {
  interface Request {
    authContext?: AuthContext;
  }
}

/**
 * Resolve the authenticated caller from Bearer authContext or session cookie.
 */
export function getAuthContext(req: Request): AuthContext | null {
  if (req.authContext?.userId) {
    return req.authContext;
  }

  if (req.session?.userId) {
    return {
      userId: req.session.userId,
      keycloakSub: req.session.keycloakSub,
      roles: req.session.roles ?? [],
      clinicId: req.session.clinicId ?? null,
    };
  }

  return null;
}
