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
  KEYCLOAK_URL: {
    required: true,
    description:
      'Base URL of Keycloak (e.g. http://localhost:8080). ' +
      'Used for both browser redirects and server-to-server calls.',
  },
  KEYCLOAK_HEALTH_URL: {
    required: false,
    defaultValue: 'http://localhost:9000/health/ready',
    description: 'Keycloak management health endpoint (port 9000 by default)',
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
} as const satisfies Record<string, EnvDefinition>;

export type EnvKey = keyof typeof ENV_DEFINITIONS;

export type AppEnv = {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  KEYCLOAK_URL: string;
  KEYCLOAK_HEALTH_URL: string;
  KEYCLOAK_REALM: string;
  KEYCLOAK_CLIENT_ID: string;
  KEYCLOAK_CLIENT_SECRET: string;
  KEYCLOAK_REDIRECT_URI: string;
};

export function getMissingRequiredEnv(raw: NodeJS.ProcessEnv = process.env): string[] {
  return (Object.entries(ENV_DEFINITIONS) as Array<[EnvKey, EnvDefinition]>)
    .filter(([key, definition]) => definition.required && !raw[key]?.trim())
    .map(([key]) => key);
}

export function resolveAppEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const missingKeys = getMissingRequiredEnv(raw);
  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
  }

  const nodeEnv = raw.NODE_ENV?.trim() || ENV_DEFINITIONS.NODE_ENV.defaultValue!;
  const portValue = raw.PORT?.trim() || ENV_DEFINITIONS.PORT.defaultValue!;
  const port = Number.parseInt(portValue, 10);

  if (Number.isNaN(port)) {
    throw new Error(`Invalid PORT value "${portValue}". PORT must be a number.`);
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: raw.DATABASE_URL!.trim(),
    KEYCLOAK_URL: raw.KEYCLOAK_URL!.trim(),
    KEYCLOAK_HEALTH_URL:
      raw.KEYCLOAK_HEALTH_URL?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_HEALTH_URL.defaultValue!,
    KEYCLOAK_REALM:
      raw.KEYCLOAK_REALM?.trim() || ENV_DEFINITIONS.KEYCLOAK_REALM.defaultValue!,
    KEYCLOAK_CLIENT_ID:
      raw.KEYCLOAK_CLIENT_ID?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_CLIENT_ID.defaultValue!,
    KEYCLOAK_CLIENT_SECRET:
      raw.KEYCLOAK_CLIENT_SECRET?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_CLIENT_SECRET.defaultValue!,
    KEYCLOAK_REDIRECT_URI:
      raw.KEYCLOAK_REDIRECT_URI?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_REDIRECT_URI.defaultValue!,
  };
}
