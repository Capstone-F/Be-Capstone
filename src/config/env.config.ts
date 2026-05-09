export type EnvDefinition = {
  required: boolean;
  defaultValue?: string;
  description: string;
};

export const ENV_DEFINITIONS = {
  NODE_ENV: {
    required: false,
    defaultValue: 'development',
    description: 'Application runtime mode',
  },
  PORT: {
    required: false,
    defaultValue: '3000',
    description: 'Port used by Nest API',
  },
  DATABASE_URL: {
    required: true,
    description: 'Postgres connection URL',
  },
  AUTH0_DOMAIN: {
    required: true,
    description:
      'Auth0 tenant domain, e.g. dev-xyz.us.auth0.com (without protocol or trailing slash). ' +
      'Used to derive the issuer https://${AUTH0_DOMAIN}/ for both browser redirects and server calls.',
  },
  AUTH0_CLIENT_ID: {
    required: true,
    description: 'Auth0 application client id (Regular Web Application)',
  },
  AUTH0_CLIENT_SECRET: {
    required: true,
    description: 'Auth0 application client secret',
  },
  AUTH0_AUDIENCE: {
    required: true,
    description:
      'Auth0 API identifier (audience) the backend exchanges access tokens for, ' +
      'e.g. https://api.be-capstone.local',
  },
  AUTH0_REDIRECT_URI: {
    required: false,
    defaultValue: 'http://localhost:3000/auth/callback',
    description: 'Default redirect URI for the authorization code flow',
  },
  AUTH0_LOGOUT_RETURN_URL: {
    required: false,
    description:
      'Where Auth0 v2/logout sends the browser back to after sign-out. ' +
      'Defaults to FRONTEND_URL.',
  },
  REDIS_URL: {
    required: false,
    defaultValue: 'redis://localhost:6379',
    description:
      'Redis connection URL for session storage (e.g. redis://redis:6379 inside Docker)',
  },
  SESSION_SECRET: {
    required: true,
    description: 'Secret used to sign the session cookie',
  },
  SESSION_COOKIE_SECURE: {
    required: false,
    description:
      'If true, session cookie uses Secure flag (HTTPS only). If unset, defaults to ' +
      'true when NODE_ENV=production. Set false when the public site is HTTP (e.g. local Docker); ' +
      'otherwise express-session will not emit Set-Cookie.',
  },
  FRONTEND_URL: {
    required: true,
    description:
      'Frontend origin URL for post-login redirects (e.g. http://localhost:5173)',
  },
  CORS_ORIGIN: {
    required: false,
    description: 'Allowed CORS origin. Defaults to FRONTEND_URL if not set.',
  },
} as const satisfies Record<string, EnvDefinition>;

export type EnvKey = keyof typeof ENV_DEFINITIONS;

export type AppEnv = {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  AUTH0_DOMAIN: string;
  AUTH0_ISSUER: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  AUTH0_AUDIENCE: string;
  AUTH0_REDIRECT_URI: string;
  AUTH0_LOGOUT_RETURN_URL: string;
  REDIS_URL: string;
  SESSION_SECRET: string;
  /** When true, Set-Cookie only over HTTPS (or when proxy sends X-Forwarded-Proto: https if proxy is enabled). */
  sessionCookieSecure: boolean;
  FRONTEND_URL: string;
  CORS_ORIGIN: string;
};

export function getMissingRequiredEnv(
  raw: NodeJS.ProcessEnv = process.env,
): string[] {
  return (Object.entries(ENV_DEFINITIONS) as Array<[EnvKey, EnvDefinition]>)
    .filter(([key, definition]) => definition.required && !raw[key]?.trim())
    .map(([key]) => key);
}

function normalizeAuth0Domain(raw: string): string {
  let value = raw.trim();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/\/+$/, '');
  return value;
}

function buildAuth0Issuer(domain: string): string {
  return `https://${domain}/`;
}

function parseOptionalBool(
  value: string | undefined,
  varName: string,
): boolean | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const v = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(v)) {
    return true;
  }
  if (['false', '0', 'no'].includes(v)) {
    return false;
  }
  throw new Error(
    `Invalid ${varName} value "${value}". Use true/false, 1/0, or yes/no.`,
  );
}

export function resolveAppEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const missingKeys = getMissingRequiredEnv(raw);
  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}`,
    );
  }

  const nodeEnv = raw.NODE_ENV?.trim() || ENV_DEFINITIONS.NODE_ENV.defaultValue;
  const sessionCookieSecureExplicit = parseOptionalBool(
    raw.SESSION_COOKIE_SECURE,
    'SESSION_COOKIE_SECURE',
  );
  const sessionCookieSecure =
    sessionCookieSecureExplicit !== undefined
      ? sessionCookieSecureExplicit
      : nodeEnv === 'production';
  const portValue = raw.PORT?.trim() || ENV_DEFINITIONS.PORT.defaultValue;
  const port = Number.parseInt(portValue, 10);

  if (Number.isNaN(port)) {
    throw new Error(
      `Invalid PORT value "${portValue}". PORT must be a number.`,
    );
  }

  const auth0Domain = normalizeAuth0Domain(raw.AUTH0_DOMAIN!);
  const frontendUrl = raw.FRONTEND_URL!.trim().replace(/\/+$/, '');

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: raw.DATABASE_URL!.trim(),
    AUTH0_DOMAIN: auth0Domain,
    AUTH0_ISSUER: buildAuth0Issuer(auth0Domain),
    AUTH0_CLIENT_ID: raw.AUTH0_CLIENT_ID!.trim(),
    AUTH0_CLIENT_SECRET: raw.AUTH0_CLIENT_SECRET!.trim(),
    AUTH0_AUDIENCE: raw.AUTH0_AUDIENCE!.trim(),
    AUTH0_REDIRECT_URI:
      raw.AUTH0_REDIRECT_URI?.trim() ||
      ENV_DEFINITIONS.AUTH0_REDIRECT_URI.defaultValue,
    AUTH0_LOGOUT_RETURN_URL:
      raw.AUTH0_LOGOUT_RETURN_URL?.trim().replace(/\/+$/, '') || frontendUrl,
    REDIS_URL: raw.REDIS_URL?.trim() || ENV_DEFINITIONS.REDIS_URL.defaultValue,
    SESSION_SECRET: raw.SESSION_SECRET!.trim(),
    sessionCookieSecure,
    FRONTEND_URL: frontendUrl,
    CORS_ORIGIN:
      raw.CORS_ORIGIN?.trim() || raw.FRONTEND_URL!.trim().replace(/\/+$/, ''),
  };
}
