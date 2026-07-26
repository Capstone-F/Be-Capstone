import { PaymentProvider } from '../enums';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateCheckoutInput {
  amountVnd: string;
  /** Opaque provider txn ref (persisted as PaymentAttempt.vnpTxnRef). */
  txnRef: string;
  /** Ecommerce order id, or a synthetic ref for wallet top-up. */
  orderId: string;
  /** Human-readable order info for gateway display. */
  orderInfo?: string;
  ipAddr: string;
  /** Backend return URL for real gateways (e.g. VNPay vnp_ReturnUrl). */
  returnUrl: string;
  paymentId: string;
}

export interface ProviderVerifyResult {
  /** Signature / integrity check passed. */
  ok: boolean;
  /** Gateway reported a successful payment. */
  success: boolean;
  txnRef: string;
  amountVnd?: string;
  responseCode?: string;
  providerTransactionId?: string | null;
  bankCode?: string | null;
  raw?: unknown;
}

export interface PaymentGateway {
  readonly code: PaymentProvider;

  createCheckout(input: CreateCheckoutInput): Promise<{ paymentUrl: string }>;

  verifyReturn(query: Record<string, unknown>): Promise<ProviderVerifyResult>;

  verifyIpn(query: Record<string, unknown>): Promise<ProviderVerifyResult>;
}
