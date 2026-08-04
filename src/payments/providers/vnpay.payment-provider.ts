import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VnpayService } from 'nestjs-vnpay';
import { ProductCode, VnpLocale } from 'vnpay';
import type { ReturnQueryFromVNPay } from 'vnpay';
import { PaymentProvider } from '../enums';
import {
  CreateCheckoutInput,
  PaymentGateway,
  ProviderVerifyResult,
} from './payment-provider.types';

@Injectable()
export class VnpayPaymentProvider implements PaymentGateway {
  readonly code = PaymentProvider.VNPAY;

  constructor(private readonly vnpay: VnpayService) {}

  createTxnRef(): string {
    return randomUUID().replace(/-/g, '');
  }

  createCheckout(input: CreateCheckoutInput): Promise<{ paymentUrl: string }> {
    const paymentUrl = this.vnpay.buildPaymentUrl({
      vnp_Amount: Number(input.amountVnd),
      vnp_IpAddr: input.ipAddr,
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo ?? `Payment for order ${input.orderId}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: input.returnUrl,
      vnp_Locale: VnpLocale.VN,
    });
    return Promise.resolve({ paymentUrl });
  }

  async verifyReturn(
    query: Record<string, unknown>,
  ): Promise<ProviderVerifyResult> {
    const verify = await this.vnpay.verifyReturnUrl(
      query as ReturnQueryFromVNPay,
    );
    return this.mapVerify(verify, query);
  }

  async verifyIpn(
    query: Record<string, unknown>,
  ): Promise<ProviderVerifyResult> {
    const verify = await this.vnpay.verifyIpnCall(
      query as ReturnQueryFromVNPay,
    );
    return this.mapVerify(verify, query);
  }

  private mapVerify(
    verify: {
      isVerified: boolean;
      isSuccess: boolean;
      vnp_TxnRef?: string | number;
      vnp_Amount?: string | number;
      vnp_ResponseCode?: string | number;
      vnp_TransactionNo?: string | number | null;
      vnp_BankCode?: string | null;
    },
    raw: unknown,
  ): ProviderVerifyResult {
    return {
      ok: verify.isVerified,
      success: verify.isSuccess,
      txnRef: String(verify.vnp_TxnRef ?? ''),
      amountVnd:
        verify.vnp_Amount != null ? String(verify.vnp_Amount) : undefined,
      responseCode:
        verify.vnp_ResponseCode != null
          ? String(verify.vnp_ResponseCode)
          : undefined,
      providerTransactionId:
        verify.vnp_TransactionNo != null
          ? String(verify.vnp_TransactionNo)
          : null,
      bankCode: verify.vnp_BankCode ?? null,
      raw,
    };
  }
}
