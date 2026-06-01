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
  KEYCLOAK_PUBLIC_URL: {
    required: true,
    description:
      'Public Keycloak base URL reachable by the browser (e.g. http://localhost:8080). ' +
      'Used for building the login redirect URL that the user visits.',
  },
  KEYCLOAK_INTERNAL_URL: {
    required: false,
    description:
      'Internal Keycloak base URL for server-to-server calls (e.g. http://keycloak:8080). ' +
      'Defaults to KEYCLOAK_PUBLIC_URL. Set this when running inside Docker Compose.',
  },
  KEYCLOAK_HEALTH_URL: {
    required: false,
    description:
      'Keycloak management health endpoint. ' +
      'Defaults to KEYCLOAK_INTERNAL_URL on port 9000.',
  },
  KEYCLOAK_REALM: {
    required: false,
    defaultValue: 'be-capstone',
    description: 'Keycloak realm used by the backend',
  },
  KEYCLOAK_CLIENT_ID: {
    required: false,
    defaultValue: 'be-capstone-api',
    description: 'OIDC client id for backend integration',
  },
  KEYCLOAK_CLIENT_SECRET: {
    required: false,
    defaultValue: 'be-capstone-secret',
    description: 'OIDC client secret for backend integration',
  },
  KEYCLOAK_REDIRECT_URI: {
    required: false,
    defaultValue: 'http://localhost:3000/auth/callback',
    description: 'Default redirect URI for authorization code flow',
  },
  KEYCLOAK_ADMIN_USER: {
    required: false,
    defaultValue: 'admin',
    description: 'Keycloak admin username for dev session endpoint',
  },
  KEYCLOAK_ADMIN_PASSWORD: {
    required: false,
    defaultValue: 'admin',
    description: 'Keycloak admin password for dev session endpoint',
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
  KEYCLOAK_PUBLIC_URL: string;
  KEYCLOAK_INTERNAL_URL: string;
  KEYCLOAK_HEALTH_URL: string;
  KEYCLOAK_REALM: string;
  KEYCLOAK_CLIENT_ID: string;
  KEYCLOAK_CLIENT_SECRET: string;
  KEYCLOAK_REDIRECT_URI: string;
  KEYCLOAK_ADMIN_USER: string;
  KEYCLOAK_ADMIN_PASSWORD: string;
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

function deriveHealthUrl(keycloakBaseUrl: string): string {
  try {
    const url = new URL(keycloakBaseUrl);
    url.port = '9000';
    url.pathname = '/health/ready';
    return url.toString();
  } catch {
    return 'http://localhost:9000/health/ready';
  }
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

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: raw.DATABASE_URL!.trim(),
    KEYCLOAK_PUBLIC_URL: raw.KEYCLOAK_PUBLIC_URL!.trim(),
    KEYCLOAK_INTERNAL_URL:
      raw.KEYCLOAK_INTERNAL_URL?.trim() || raw.KEYCLOAK_PUBLIC_URL!.trim(),
    KEYCLOAK_HEALTH_URL:
      raw.KEYCLOAK_HEALTH_URL?.trim() ||
      deriveHealthUrl(
        raw.KEYCLOAK_INTERNAL_URL?.trim() || raw.KEYCLOAK_PUBLIC_URL!.trim(),
      ),
    KEYCLOAK_REALM:
      raw.KEYCLOAK_REALM?.trim() || ENV_DEFINITIONS.KEYCLOAK_REALM.defaultValue,
    KEYCLOAK_CLIENT_ID:
      raw.KEYCLOAK_CLIENT_ID?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_CLIENT_ID.defaultValue,
    KEYCLOAK_CLIENT_SECRET:
      raw.KEYCLOAK_CLIENT_SECRET?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_CLIENT_SECRET.defaultValue,
    KEYCLOAK_REDIRECT_URI:
      raw.KEYCLOAK_REDIRECT_URI?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_REDIRECT_URI.defaultValue,
    KEYCLOAK_ADMIN_USER:
      raw.KEYCLOAK_ADMIN_USER?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_ADMIN_USER.defaultValue,
    KEYCLOAK_ADMIN_PASSWORD:
      raw.KEYCLOAK_ADMIN_PASSWORD?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_ADMIN_PASSWORD.defaultValue,
    REDIS_URL: raw.REDIS_URL?.trim() || ENV_DEFINITIONS.REDIS_URL.defaultValue,
    SESSION_SECRET: raw.SESSION_SECRET!.trim(),
    sessionCookieSecure,
    FRONTEND_URL: raw.FRONTEND_URL!.trim().replace(/\/+$/, ''),
    CORS_ORIGIN:
      raw.CORS_ORIGIN?.trim() || raw.FRONTEND_URL!.trim().replace(/\/+$/, ''),
  };
}
