import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    keycloakSub?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    idpHint?: string;
    oauthState?: string;
    /** Post-login redirect set by POST /auth/login (validated against FRONTEND_URL origin). */
    clientRedirectUri?: string;
    /** Application roles from Keycloak realm_access.roles (cached on session). */
    roles?: string[];
    /** Partner clinic id for clinic_manager / expert (mirrored from local User). */
    clinicId?: string | null;
  }
}
