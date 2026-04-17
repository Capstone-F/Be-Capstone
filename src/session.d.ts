import 'express';

interface AppSessionData {
  userId: string;
  keycloakSub: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  idpHint?: string;
  oauthState?: string;
}

declare module 'express' {
  interface Request {
    session: import('express-session').Session & Partial<AppSessionData>;
    sessionID: string;
  }
}
