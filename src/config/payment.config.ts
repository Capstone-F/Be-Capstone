export type PaymentConfig = {
  /** VNPay merchant terminal code (TMN Code). */
  tmnCode: string;
  /** VNPay hash secret used to sign/verify checksums (maps to vnpay `secureSecret`). */
  hashSecret: string;
  /** VNPay gateway host, e.g. https://sandbox.vnpayment.vn (maps to vnpay `vnpayHost`). */
  vnpayHost: string;
  /** Backend endpoint sent to VNPay as vnp_ReturnUrl (verifies, then redirects to the client). */
  returnUrl: string;
  /** IPN URL registered in the VNPay portal — informational only. */
  ipnUrl: string;
};

export type PayosConfig = {
  /** PayOS Client ID from the merchant dashboard. */
  clientId: string;
  /** PayOS API key. */
  apiKey: string;
  /** PayOS checksum key used to verify webhooks / payment signatures. */
  checksumKey: string;
  /** Backend endpoint PayOS redirects the browser to after payment (returnUrl). */
  returnUrl: string;
  /** Backend endpoint PayOS redirects to when the user cancels. */
  cancelUrl: string;
  /** Webhook URL registered in the PayOS portal — informational only. */
  webhookUrl: string;
};
