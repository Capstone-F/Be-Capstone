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
    description: 'Keycloak master-realm admin username (Admin API)',
  },
  KEYCLOAK_ADMIN_PASSWORD: {
    required: false,
    defaultValue: 'admin',
    description: 'Keycloak master-realm admin password (Admin API)',
  },
  KEYCLOAK_DEV_ADMIN_USER: {
    required: false,
    defaultValue: 'glowscan-admin',
    description:
      'Realm App Admin username for GET /auth/dev/session (password grant)',
  },
  KEYCLOAK_DEV_ADMIN_PASSWORD: {
    required: false,
    defaultValue: 'admin',
    description:
      'Realm App Admin password for GET /auth/dev/session (password grant)',
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
  VNP_TMN_CODE: {
    required: false,
    description: 'VNPay merchant terminal code (TMN Code).',
  },
  VNP_HASH_SECRET: {
    required: false,
    description:
      'VNPay hash secret used to sign and verify payment/IPN checksums.',
  },
  VNP_URL: {
    required: false,
    defaultValue: 'https://sandbox.vnpayment.vn',
    description:
      'VNPay gateway host (vnpayHost). The library appends endpoint paths. Sandbox: https://sandbox.vnpayment.vn.',
  },
  VNP_RETURN_URL: {
    required: false,
    defaultValue: 'http://localhost:3000/payments/vnpay/return',
    description:
      'Backend endpoint VNPay redirects the browser to (sent as vnp_ReturnUrl). It verifies the signature, then 302s the user to the client landing URL. In production include the /api prefix.',
  },
  VNP_IPN_URL: {
    required: false,
    description:
      'VNPay IPN callback URL, registered in the VNPay merchant portal (server-to-server). Informational only — not sent in the payment request.',
  },
  CLIENT_RETURN_URL: {
    required: false,
    description:
      'Web client landing URL payment return endpoints 302 to after verifying. Shared by all gateways. Defaults to FRONTEND_URL + /vnpay_return.',
  },
  MOBILE_RETURN_URL: {
    required: false,
    defaultValue: 'glowscan://vnpay-return',
    description:
      'Mobile deep link payment return endpoints 302 to when checkout was initiated by the mobile client. Shared by all gateways.',
  },
  PAYOS_CLIENT_ID: {
    required: false,
    description: 'PayOS Client ID from the merchant dashboard.',
  },
  PAYOS_API_KEY: {
    required: false,
    description: 'PayOS API key from the merchant dashboard.',
  },
  PAYOS_CHECKSUM_KEY: {
    required: false,
    description:
      'PayOS checksum key used to verify payment link and webhook signatures.',
  },
  PAYOS_RETURN_URL: {
    required: false,
    defaultValue: 'http://localhost:3000/payments/payos/return',
    description:
      'Backend endpoint PayOS redirects the browser to after payment. It verifies, then 302s the user to the client landing URL. In production include the /api prefix.',
  },
  PAYOS_CANCEL_URL: {
    required: false,
    defaultValue: 'http://localhost:3000/payments/payos/return',
    description:
      'Backend endpoint PayOS redirects to when the user cancels checkout. Defaults to the same as PAYOS_RETURN_URL.',
  },
  PAYOS_WEBHOOK_URL: {
    required: false,
    description:
      'PayOS webhook URL registered in the merchant portal (server-to-server). Informational only — not sent in the payment request.',
  },
  MOBILE_REDIRECT_URIS: {
    required: false,
    defaultValue: 'glowscan://auth/callback',
    description:
      'Comma-separated whitelist of mobile deep-link redirect URIs ' +
      '(e.g. glowscan://auth/callback). Used by POST /auth/login for Expo.',
  },
  MOBILE_AUTH_CODE_TTL_SECONDS: {
    required: false,
    defaultValue: '120',
    description:
      'TTL in seconds for one-time mobile auth codes stored in Redis ' +
      '(POST /auth/mobile/exchange).',
  },
  MOBILE_OAUTH_STATE_TTL_SECONDS: {
    required: false,
    defaultValue: '600',
    description:
      'TTL in seconds for mobile OAuth state entries stored in Redis ' +
      '(POST /auth/login mobile flow).',
  },
  PAYMENT_PROVIDER: {
    required: false,
    defaultValue: 'vnpay',
    description:
      'Active payment gateway for order checkout (vnpay | mock | payos). Client checkout/status APIs stay the same; mock completes via GET /payments/mock/complete.',
  },
  LLM_PROVIDER: {
    required: false,
    defaultValue: 'mock',
    description:
      'LLM provider for routine generation and survey face-scan (mock | ollama | openai | gemini). mock and ollama are implemented.',
  },
  OLLAMA_BASE_URL: {
    required: false,
    defaultValue: 'http://host.docker.internal:11434',
    description:
      'Ollama API base URL. Use http://host.docker.internal:11434 when the API runs in Docker and Ollama on the host; use http://localhost:11434 when both run on the host.',
  },
  OLLAMA_MODEL: {
    required: false,
    defaultValue: 'gpt-oss:120b-cloud',
    description: 'Ollama model tag used for routine generation.',
  },
  OLLAMA_VISION_MODEL: {
    required: false,
    defaultValue: 'llava',
    description:
      'Ollama multimodal model tag used for survey facial skin analysis.',
  },
  OLLAMA_TIMEOUT_MS: {
    required: false,
    defaultValue: '120000',
    description: 'Timeout in milliseconds for Ollama chat requests.',
  },
  GHN_TOKEN: {
    required: false,
    description: 'GHN API token, sent as the Token header on every GHN call.',
  },
  GHN_SHOP_ID: {
    required: false,
    description: 'GHN shop id, sent as the ShopId header on every GHN call.',
  },
  GHN_BASE_URL: {
    required: false,
    defaultValue: 'https://dev-online-gateway.ghn.vn',
    description:
      'GHN gateway host. Sandbox: https://dev-online-gateway.ghn.vn; production: https://online-gateway.ghn.vn.',
  },
  GHN_FROM_DISTRICT_ID: {
    required: false,
    defaultValue: '0',
    description:
      'Pickup district id of the warehouse registered on the GHN shop (pairs with GHN_SHOP_ID).',
  },
  GHN_FROM_WARD_CODE: {
    required: false,
    description:
      'Pickup ward code of the warehouse registered on the GHN shop (pairs with GHN_SHOP_ID).',
  },
  GHN_WEBHOOK_SECRET: {
    required: false,
    description:
      'Shared secret embedded in the GHN webhook URL path. GHN does not sign callbacks, ' +
      'so this path segment is the only authentication gate on the webhook.',
  },
  ZEGO_APP_ID: {
    required: false,
    description:
      'ZegoCloud App ID from the Admin Console (Video Call). Used to mint Token04 for consultation rooms.',
  },
  ZEGO_SERVER_SECRET: {
    required: false,
    description:
      'ZegoCloud Server Secret (32-byte string) from the Admin Console. Used server-side only to mint Token04.',
  },
  R2_ACCOUNT_ID: {
    required: false,
    description:
      'Cloudflare R2 account id. Used to build the S3-compatible API endpoint.',
  },
  R2_ACCESS_KEY_ID: {
    required: false,
    description: 'R2 API token access key id (S3-compatible).',
  },
  R2_SECRET_ACCESS_KEY: {
    required: false,
    description: 'R2 API token secret access key (S3-compatible).',
  },
  R2_BUCKET: {
    required: false,
    description: 'R2 bucket name for uploaded images.',
  },
  R2_PUBLIC_BASE_URL: {
    required: false,
    description:
      'Public base URL for objects (r2.dev subdomain or custom domain). No trailing slash.',
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
  KEYCLOAK_DEV_ADMIN_USER: string;
  KEYCLOAK_DEV_ADMIN_PASSWORD: string;
  REDIS_URL: string;
  SESSION_SECRET: string;
  /** When true, Set-Cookie only over HTTPS (or when proxy sends X-Forwarded-Proto: https if proxy is enabled). */
  sessionCookieSecure: boolean;
  FRONTEND_URL: string;
  CORS_ORIGIN: string;
  VNP_TMN_CODE: string;
  VNP_HASH_SECRET: string;
  VNP_URL: string;
  VNP_RETURN_URL: string;
  VNP_IPN_URL: string;
  CLIENT_RETURN_URL: string;
  MOBILE_RETURN_URL: string;
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  PAYOS_RETURN_URL: string;
  PAYOS_CANCEL_URL: string;
  PAYOS_WEBHOOK_URL: string;
  MOBILE_REDIRECT_URIS: string[];
  MOBILE_AUTH_CODE_TTL_SECONDS: number;
  MOBILE_OAUTH_STATE_TTL_SECONDS: number;
  PAYMENT_PROVIDER: string;
  LLM_PROVIDER: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_VISION_MODEL: string;
  OLLAMA_TIMEOUT_MS: number;
  GHN_TOKEN: string;
  GHN_SHOP_ID: string;
  GHN_BASE_URL: string;
  GHN_FROM_DISTRICT_ID: number;
  GHN_FROM_WARD_CODE: string;
  GHN_WEBHOOK_SECRET: string;
  ZEGO_APP_ID: string;
  ZEGO_SERVER_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;
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

function parsePositiveInt(
  value: string | undefined,
  varName: string,
  defaultValue: string,
): number {
  const raw = value?.trim() || defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${varName} value "${raw}". Must be a positive integer.`,
    );
  }
  return parsed;
}

/**
 * Like parsePositiveInt but allows 0, which GHN_FROM_DISTRICT_ID uses to mean
 * "not configured" (a real GHN district id is always > 0).
 */
function parseNonNegativeInt(
  value: string | undefined,
  varName: string,
  defaultValue: string,
): number {
  const raw = value?.trim() || defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${varName} value "${raw}". Must be a non-negative integer.`,
    );
  }
  return parsed;
}

function parseCommaSeparatedList(
  value: string | undefined,
  defaultValue: string,
): string[] {
  const raw = value?.trim() || defaultValue;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
    KEYCLOAK_DEV_ADMIN_USER:
      raw.KEYCLOAK_DEV_ADMIN_USER?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_DEV_ADMIN_USER.defaultValue,
    KEYCLOAK_DEV_ADMIN_PASSWORD:
      raw.KEYCLOAK_DEV_ADMIN_PASSWORD?.trim() ||
      ENV_DEFINITIONS.KEYCLOAK_DEV_ADMIN_PASSWORD.defaultValue,
    REDIS_URL: raw.REDIS_URL?.trim() || ENV_DEFINITIONS.REDIS_URL.defaultValue,
    SESSION_SECRET: raw.SESSION_SECRET!.trim(),
    sessionCookieSecure,
    FRONTEND_URL: raw.FRONTEND_URL!.trim().replace(/\/+$/, ''),
    CORS_ORIGIN:
      raw.CORS_ORIGIN?.trim() || raw.FRONTEND_URL!.trim().replace(/\/+$/, ''),
    VNP_TMN_CODE: raw.VNP_TMN_CODE?.trim() || '',
    VNP_HASH_SECRET: raw.VNP_HASH_SECRET?.trim() || '',
    VNP_URL: raw.VNP_URL?.trim() || ENV_DEFINITIONS.VNP_URL.defaultValue,
    VNP_RETURN_URL:
      raw.VNP_RETURN_URL?.trim() || ENV_DEFINITIONS.VNP_RETURN_URL.defaultValue,
    VNP_IPN_URL: raw.VNP_IPN_URL?.trim() || '',
    CLIENT_RETURN_URL:
      raw.CLIENT_RETURN_URL?.trim() ||
      `${raw.FRONTEND_URL!.trim().replace(/\/+$/, '')}/vnpay_return`,
    MOBILE_RETURN_URL:
      raw.MOBILE_RETURN_URL?.trim() ||
      ENV_DEFINITIONS.MOBILE_RETURN_URL.defaultValue,
    PAYOS_CLIENT_ID: raw.PAYOS_CLIENT_ID?.trim() || '',
    PAYOS_API_KEY: raw.PAYOS_API_KEY?.trim() || '',
    PAYOS_CHECKSUM_KEY: raw.PAYOS_CHECKSUM_KEY?.trim() || '',
    PAYOS_RETURN_URL:
      raw.PAYOS_RETURN_URL?.trim() ||
      ENV_DEFINITIONS.PAYOS_RETURN_URL.defaultValue,
    PAYOS_CANCEL_URL:
      raw.PAYOS_CANCEL_URL?.trim() ||
      raw.PAYOS_RETURN_URL?.trim() ||
      ENV_DEFINITIONS.PAYOS_CANCEL_URL.defaultValue,
    PAYOS_WEBHOOK_URL: raw.PAYOS_WEBHOOK_URL?.trim() || '',
    MOBILE_REDIRECT_URIS: parseCommaSeparatedList(
      raw.MOBILE_REDIRECT_URIS,
      ENV_DEFINITIONS.MOBILE_REDIRECT_URIS.defaultValue,
    ),
    MOBILE_AUTH_CODE_TTL_SECONDS: parsePositiveInt(
      raw.MOBILE_AUTH_CODE_TTL_SECONDS,
      'MOBILE_AUTH_CODE_TTL_SECONDS',
      ENV_DEFINITIONS.MOBILE_AUTH_CODE_TTL_SECONDS.defaultValue,
    ),
    MOBILE_OAUTH_STATE_TTL_SECONDS: parsePositiveInt(
      raw.MOBILE_OAUTH_STATE_TTL_SECONDS,
      'MOBILE_OAUTH_STATE_TTL_SECONDS',
      ENV_DEFINITIONS.MOBILE_OAUTH_STATE_TTL_SECONDS.defaultValue,
    ),
    PAYMENT_PROVIDER: (() => {
      const value = (
        raw.PAYMENT_PROVIDER?.trim() ||
        ENV_DEFINITIONS.PAYMENT_PROVIDER.defaultValue
      ).toLowerCase();
      if (value !== 'vnpay' && value !== 'mock' && value !== 'payos') {
        throw new Error(
          `Invalid PAYMENT_PROVIDER "${value}". Expected "vnpay", "mock", or "payos".`,
        );
      }
      return value;
    })(),
    LLM_PROVIDER:
      raw.LLM_PROVIDER?.trim() || ENV_DEFINITIONS.LLM_PROVIDER.defaultValue,
    OLLAMA_BASE_URL: (
      raw.OLLAMA_BASE_URL?.trim() ||
      ENV_DEFINITIONS.OLLAMA_BASE_URL.defaultValue
    ).replace(/\/+$/, ''),
    OLLAMA_MODEL:
      raw.OLLAMA_MODEL?.trim() || ENV_DEFINITIONS.OLLAMA_MODEL.defaultValue,
    OLLAMA_VISION_MODEL:
      raw.OLLAMA_VISION_MODEL?.trim() ||
      ENV_DEFINITIONS.OLLAMA_VISION_MODEL.defaultValue,
    OLLAMA_TIMEOUT_MS: parsePositiveInt(
      raw.OLLAMA_TIMEOUT_MS,
      'OLLAMA_TIMEOUT_MS',
      ENV_DEFINITIONS.OLLAMA_TIMEOUT_MS.defaultValue,
    ),
    GHN_TOKEN: raw.GHN_TOKEN?.trim() || '',
    GHN_SHOP_ID: raw.GHN_SHOP_ID?.trim() || '',
    GHN_BASE_URL: (
      raw.GHN_BASE_URL?.trim() || ENV_DEFINITIONS.GHN_BASE_URL.defaultValue
    ).replace(/\/+$/, ''),
    GHN_FROM_DISTRICT_ID: parseNonNegativeInt(
      raw.GHN_FROM_DISTRICT_ID,
      'GHN_FROM_DISTRICT_ID',
      ENV_DEFINITIONS.GHN_FROM_DISTRICT_ID.defaultValue,
    ),
    GHN_FROM_WARD_CODE: raw.GHN_FROM_WARD_CODE?.trim() || '',
    GHN_WEBHOOK_SECRET: raw.GHN_WEBHOOK_SECRET?.trim() || '',
    ZEGO_APP_ID: raw.ZEGO_APP_ID?.trim() || '',
    ZEGO_SERVER_SECRET: raw.ZEGO_SERVER_SECRET?.trim() || '',
    R2_ACCOUNT_ID: raw.R2_ACCOUNT_ID?.trim() || '',
    R2_ACCESS_KEY_ID: raw.R2_ACCESS_KEY_ID?.trim() || '',
    R2_SECRET_ACCESS_KEY: raw.R2_SECRET_ACCESS_KEY?.trim() || '',
    R2_BUCKET: raw.R2_BUCKET?.trim() || '',
    R2_PUBLIC_BASE_URL: (raw.R2_PUBLIC_BASE_URL?.trim() || '').replace(
      /\/+$/,
      '',
    ),
  };
}
