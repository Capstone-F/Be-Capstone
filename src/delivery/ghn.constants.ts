/**
 * Parcel and business defaults for the GHN integration.
 *
 * These are deliberately NOT environment variables: they are physical/business facts,
 * not per-deployment configuration. Only credentials, the gateway host, and the shop's
 * pickup location live in env (see `ShippingConfig`).
 */

/** DeliveryProvider.code for GHN — seeded by src/database/seeds/seed.ts. */
export const GHN_PROVIDER_CODE = 'GHN';

/** GHN service type. 1 = Express, 2 = Standard. */
export const GHN_SERVICE_TYPE_STANDARD = 2;

/**
 * GHN `required_note`. Valid values: CHOTHUHANG | CHOXEMHANGKHONGTHU | KHONGCHOXEMHANG.
 * Orders are prepaid via VNPay, so the shipper does not let the buyer inspect before accepting.
 */
export const GHN_REQUIRED_NOTE = 'KHONGCHOXEMHANG';

/** GHN `payment_type_id`. 1 = shop pays GHN, 2 = buyer pays. */
export const GHN_PAYMENT_TYPE_SHOP_PAYS = 1;

/** Fallback per-item weight in grams when a variant has no weight recorded. */
export const DEFAULT_ITEM_WEIGHT_GRAM = 200;

/**
 * Default parcel box, in cm. GHN requires dimensions on every fee/create call.
 *
 * TODO: dimensions properly belong on ProductVariant alongside weightGram. Until products
 * carry them, every parcel is quoted as one standard box. Revisit if oversized items ship.
 */
export const DEFAULT_PARCEL_BOX = {
  lengthCm: 20,
  widthCm: 15,
  heightCm: 10,
} as const;

/** GHN parcel weight bounds in grams (max is a hard GHN API limit). */
export const MIN_PARCEL_WEIGHT_GRAM = 50;
export const MAX_PARCEL_WEIGHT_GRAM = 30_000;

/** Timeout for outbound GHN requests, in milliseconds. */
export const GHN_TIMEOUT_MS = 10_000;
