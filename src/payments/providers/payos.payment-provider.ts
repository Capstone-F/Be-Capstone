import { Injectable, Logger } from '@nestjs/common';
import { PayOS } from '@payos/node';
import type { Webhook } from '@payos/node';
import { AppConfigService } from '../../config/config.service';
import { PaymentProvider } from '../enums';
import {
  CreateCheckoutInput,
  PaymentGateway,
  ProviderVerifyResult,
} from './payment-provider.types';

/** PayOS / VietQR description length limit for linked payment channels. */
const PAYOS_DESCRIPTION_MAX_LEN = 25;

function queryString(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}

@Injectable()
export class PayosPaymentProvider implements PaymentGateway {
  readonly code = PaymentProvider.PAYOS;
  private readonly logger = new Logger(PayosPaymentProvider.name);
  private readonly payos: PayOS;

  constructor(config: AppConfigService, payosClient?: PayOS) {
    const c = config.payosConfig;
    this.payos =
      payosClient ??
      new PayOS({
        clientId: c.clientId || 'unused',
        apiKey: c.apiKey || 'unused',
        checksumKey: c.checksumKey || 'unused',
      });
  }

  /**
   * PayOS requires a unique integer orderCode. Stored as string on vnpTxnRef.
   */
  createTxnRef(): string {
    return String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  }

  async createCheckout(
    input: CreateCheckoutInput,
  ): Promise<{ paymentUrl: string }> {
    const description = (input.orderInfo ?? `Payment ${input.orderId}`).slice(
      0,
      PAYOS_DESCRIPTION_MAX_LEN,
    );

    const result = await this.payos.paymentRequests.create({
      orderCode: Number(input.txnRef),
      amount: Number(input.amountVnd),
      description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl ?? input.returnUrl,
    });

    return { paymentUrl: result.checkoutUrl };
  }

  /**
   * Return redirect is informational — webhook is the sole mutator.
   * PayOS appends code, id, cancel, status, orderCode as query params.
   */
  verifyReturn(query: Record<string, unknown>): Promise<ProviderVerifyResult> {
    const orderCode = queryString(query.orderCode ?? query.order_code);
    const code = queryString(query.code);
    const status = queryString(query.status);
    const cancelRaw = queryString(query.cancel);
    const cancel = query.cancel === true || cancelRaw?.toLowerCase() === 'true';

    const success =
      !cancel &&
      (code === '00' ||
        status?.toUpperCase() === 'PAID' ||
        status?.toUpperCase() === 'SUCCESS');

    return Promise.resolve({
      ok: orderCode != null && orderCode.length > 0,
      success,
      txnRef: orderCode ?? '',
      responseCode: code ?? status ?? (cancel ? 'CANCELLED' : undefined),
      providerTransactionId: queryString(query.id) ?? null,
      raw: query,
    });
  }

  async verifyIpn(
    body: Record<string, unknown>,
  ): Promise<ProviderVerifyResult> {
    try {
      const data = await this.payos.webhooks.verify(body as Webhook);
      return {
        ok: true,
        success: data.code === '00',
        txnRef: String(data.orderCode),
        amountVnd: String(data.amount),
        responseCode: data.code,
        providerTransactionId: data.reference || data.paymentLinkId || null,
        bankCode: data.counterAccountBankId ?? null,
        raw: body,
      };
    } catch (error) {
      this.logger.warn(
        `PayOS webhook verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        success: false,
        txnRef: '',
        raw: body,
      };
    }
  }
}
