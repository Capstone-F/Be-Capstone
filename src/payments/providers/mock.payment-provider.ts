import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/config.service';
import { PaymentProvider } from '../enums';
import {
  CreateCheckoutInput,
  PaymentGateway,
  ProviderVerifyResult,
} from './payment-provider.types';

/**
 * Local/dev gateway: checkout URL hits GET /payments/mock/complete which
 * finalizes the payment, then redirects to the client landing URL.
 */
@Injectable()
export class MockPaymentProvider implements PaymentGateway {
  readonly code = PaymentProvider.MOCK;

  constructor(private readonly config: AppConfigService) {}

  createTxnRef(): string {
    return randomUUID().replace(/-/g, '');
  }

  createCheckout(input: CreateCheckoutInput): Promise<{ paymentUrl: string }> {
    const url = new URL(this.mockCompleteBaseUrl());
    url.searchParams.set('paymentId', input.paymentId);
    url.searchParams.set('txnRef', input.txnRef);
    return Promise.resolve({ paymentUrl: url.toString() });
  }

  verifyReturn(): Promise<ProviderVerifyResult> {
    return Promise.resolve({
      ok: false,
      success: false,
      txnRef: '',
    });
  }

  verifyIpn(): Promise<ProviderVerifyResult> {
    return Promise.resolve({
      ok: false,
      success: false,
      txnRef: '',
    });
  }

  /**
   * Derive public API origin (+ optional /api prefix) from VNP_RETURN_URL so
   * mock complete works in local and production path prefixes.
   */
  private mockCompleteBaseUrl(): string {
    const returnUrl = this.config.paymentConfig.returnUrl;
    try {
      const parsed = new URL(returnUrl);
      const basePath = parsed.pathname.replace(
        /\/payments\/vnpay\/return\/?$/i,
        '',
      );
      return `${parsed.origin}${basePath}/payments/mock/complete`;
    } catch {
      return `http://localhost:${this.config.port}/payments/mock/complete`;
    }
  }
}
