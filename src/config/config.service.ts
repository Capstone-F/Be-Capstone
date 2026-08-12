import { Injectable } from '@nestjs/common';
import { AppEnv, getMissingRequiredEnv, resolveAppEnv } from './env.config';
import { LlmConfig } from './llm.config';
import { PaymentConfig, PayosConfig } from './payment.config';
import { DeliverySimulationConfig } from './delivery-simulation.config';
import { OrderCancellationConfig } from './order-cancellation.config';
import { ShippingConfig } from './shipping.config';

@Injectable()
export class AppConfigService {
  private readonly env: AppEnv;

  constructor() {
    this.env = resolveAppEnv();
  }

  get nodeEnv(): string {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  /** Public Keycloak URL reachable by the browser (login page redirects). */
  get keycloakPublicUrl(): string {
    return this.env.KEYCLOAK_PUBLIC_URL;
  }

  /** Internal Keycloak URL for server-to-server calls (token exchange, etc.). */
  get keycloakInternalUrl(): string {
    return this.env.KEYCLOAK_INTERNAL_URL;
  }

  get keycloakHealthUrl(): string {
    return this.env.KEYCLOAK_HEALTH_URL;
  }

  get keycloakRealm(): string {
    return this.env.KEYCLOAK_REALM;
  }

  get keycloakClientId(): string {
    return this.env.KEYCLOAK_CLIENT_ID;
  }

  get keycloakClientSecret(): string {
    return this.env.KEYCLOAK_CLIENT_SECRET;
  }

  get keycloakRedirectUri(): string {
    return this.env.KEYCLOAK_REDIRECT_URI;
  }

  get keycloakAdminUser(): string {
    return this.env.KEYCLOAK_ADMIN_USER;
  }

  get keycloakAdminPassword(): string {
    return this.env.KEYCLOAK_ADMIN_PASSWORD;
  }

  get keycloakDevAdminUser(): string {
    return this.env.KEYCLOAK_DEV_ADMIN_USER;
  }

  get keycloakDevAdminPassword(): string {
    return this.env.KEYCLOAK_DEV_ADMIN_PASSWORD;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get sessionSecret(): string {
    return this.env.SESSION_SECRET;
  }

  /**
   * Secure session cookie (HTTPS). When true on plain HTTP, express-session omits Set-Cookie.
   * Override with SESSION_COOKIE_SECURE=false for HTTP deployments (e.g. local compose).
   */
  get sessionCookieSecure(): boolean {
    return this.env.sessionCookieSecure;
  }

  get frontendUrl(): string {
    return this.env.FRONTEND_URL;
  }

  get corsOrigin(): string {
    return this.env.CORS_ORIGIN;
  }

  /** VNPay integration config, grouped for easy sandbox/production switching. */
  get paymentConfig(): PaymentConfig {
    return {
      tmnCode: this.env.VNP_TMN_CODE,
      hashSecret: this.env.VNP_HASH_SECRET,
      vnpayHost: this.env.VNP_URL,
      returnUrl: this.env.VNP_RETURN_URL,
      ipnUrl: this.env.VNP_IPN_URL,
    };
  }

  /** PayOS integration config. */
  get payosConfig(): PayosConfig {
    return {
      clientId: this.env.PAYOS_CLIENT_ID,
      apiKey: this.env.PAYOS_API_KEY,
      checksumKey: this.env.PAYOS_CHECKSUM_KEY,
      returnUrl: this.env.PAYOS_RETURN_URL,
      cancelUrl: this.env.PAYOS_CANCEL_URL,
      webhookUrl: this.env.PAYOS_WEBHOOK_URL,
    };
  }

  /** Web client landing URL shared by all payment gateways after return. */
  get clientReturnUrl(): string {
    return this.env.CLIENT_RETURN_URL;
  }

  /** Mobile deep link landing URL shared by all payment gateways after return. */
  get mobileReturnUrl(): string {
    return this.env.MOBILE_RETURN_URL;
  }

  /** Active order-payment gateway (vnpay | mock | payos). */
  get paymentProvider(): string {
    return this.env.PAYMENT_PROVIDER;
  }

  /** Whitelisted mobile deep-link redirect URIs (exact match). */
  get mobileRedirectUris(): string[] {
    return this.env.MOBILE_REDIRECT_URIS;
  }

  /** TTL for one-time mobile auth codes in Redis (seconds). */
  get mobileAuthCodeTtlSeconds(): number {
    return this.env.MOBILE_AUTH_CODE_TTL_SECONDS;
  }

  /** TTL for mobile OAuth state entries in Redis (seconds). */
  get mobileOauthStateTtlSeconds(): number {
    return this.env.MOBILE_OAUTH_STATE_TTL_SECONDS;
  }

  /** LLM provider key for routine generation and face-scan (mock by default). */
  get llmProvider(): string {
    return this.env.LLM_PROVIDER;
  }

  /**
   * GHN shipping credentials, gateway host, and warehouse pickup location.
   * Parcel/business defaults are constants in `delivery/ghn.constants.ts`, not env.
   */
  get shippingConfig(): ShippingConfig {
    return {
      token: this.env.GHN_TOKEN,
      shopId: this.env.GHN_SHOP_ID,
      baseUrl: this.env.GHN_BASE_URL,
      fromDistrictId: this.env.GHN_FROM_DISTRICT_ID,
      fromWardCode: this.env.GHN_FROM_WARD_CODE,
      webhookSecret: this.env.GHN_WEBHOOK_SECRET,
    };
  }

  /** Grouped LLM / Ollama / Gemini settings for routines and face-scan. */
  get llmConfig(): LlmConfig {
    return {
      provider: this.env.LLM_PROVIDER,
      ollamaBaseUrl: this.env.OLLAMA_BASE_URL,
      ollamaModel: this.env.OLLAMA_MODEL,
      ollamaVisionModel: this.env.OLLAMA_VISION_MODEL,
      ollamaTimeoutMs: this.env.OLLAMA_TIMEOUT_MS,
      geminiApiKey: this.env.GEMINI_API_KEY,
      geminiModel: this.env.GEMINI_MODEL,
    };
  }

  /** ZegoCloud App ID for consultation video Token04. Empty when not configured. */
  get zegoAppId(): string {
    return this.env.ZEGO_APP_ID;
  }

  /** ZegoCloud Server Secret (32 chars). Empty when not configured. */
  get zegoServerSecret(): string {
    return this.env.ZEGO_SERVER_SECRET;
  }

  /** Cloudflare R2 account id. Empty when not configured. */
  get r2AccountId(): string {
    return this.env.R2_ACCOUNT_ID;
  }

  get r2AccessKeyId(): string {
    return this.env.R2_ACCESS_KEY_ID;
  }

  get r2SecretAccessKey(): string {
    return this.env.R2_SECRET_ACCESS_KEY;
  }

  get r2Bucket(): string {
    return this.env.R2_BUCKET;
  }

  /** Public base URL for R2 objects (no trailing slash). Empty when not configured. */
  get r2PublicBaseUrl(): string {
    return this.env.R2_PUBLIC_BASE_URL;
  }

  /** Cron-driven order cancellation pipeline (refund + restock). */
  get orderCancellationConfig(): OrderCancellationConfig {
    return {
      cronEnabled: this.env.ORDER_CANCELLATION_CRON_ENABLED,
      tickCron: this.env.ORDER_CANCELLATION_TICK_CRON,
      stepDelaySec: this.env.ORDER_CANCELLATION_STEP_DELAY_SEC,
      batchSize: this.env.ORDER_CANCELLATION_BATCH_SIZE,
    };
  }

  /**
   * Sandbox delivery-status simulator (GHN sandbox does not fire webhooks).
   * Keep cronEnabled false in production.
   */
  get deliverySimulationConfig(): DeliverySimulationConfig {
    return {
      cronEnabled: this.env.DELIVERY_SIMULATION_ENABLED,
      tickCron: this.env.DELIVERY_SIMULATION_TICK_CRON,
      stepDelaySec: this.env.DELIVERY_SIMULATION_STEP_DELAY_SEC,
      batchSize: this.env.DELIVERY_SIMULATION_BATCH_SIZE,
    };
  }

  getMissingRequiredKeys(): string[] {
    return getMissingRequiredEnv();
  }
}
