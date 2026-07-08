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
  /** Web client landing URL the return endpoint redirects to. */
  clientReturnUrl: string;
  /** Mobile deep link the return endpoint redirects to. */
  mobileReturnUrl: string;
};
