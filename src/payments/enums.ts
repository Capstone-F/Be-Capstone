export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentAttemptStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum PaymentProvider {
  VNPAY = 'VNPAY',
  MOCK = 'MOCK',
  // PAYOS reserved for a future production provider — do not add until implemented.
}

/** Which client initiated checkout — selects the landing URL the return endpoint redirects to. */
export enum PaymentClient {
  WEB = 'web',
  MOBILE = 'mobile',
}
