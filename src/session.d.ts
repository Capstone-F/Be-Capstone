import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    auth0Sub?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    idpHint?: string;
    /** CSRF state from POST /auth/login; verified in GET /auth/callback. Persisted in Redis via the session store. */
    oauthState?: string;
    /** Post-login redirect set by POST /auth/login (validated against FRONTEND_URL origin). */
    clientRedirectUri?: string;
  }
}
