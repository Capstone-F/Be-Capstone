import { PayOS } from '@payos/node';
import { AppConfigService } from '../../config/config.service';
import { PaymentProvider } from '../enums';
import { PayosPaymentProvider } from './payos.payment-provider';

describe('PayosPaymentProvider', () => {
  const config = {
    payosConfig: {
      clientId: 'cid',
      apiKey: 'key',
      checksumKey: 'checksum',
      returnUrl: 'http://localhost:3000/payments/payos/return',
      cancelUrl: 'http://localhost:3000/payments/payos/return',
      webhookUrl: '',
    },
  } as unknown as AppConfigService;

  it('createTxnRef returns a numeric string', () => {
    const provider = new PayosPaymentProvider(config);
    expect(provider.code).toBe(PaymentProvider.PAYOS);
    expect(provider.createTxnRef()).toMatch(/^\d+$/);
  });

  it('delegates createCheckout to PayOS paymentRequests.create', async () => {
    const payos = {
      paymentRequests: {
        create: jest.fn().mockResolvedValue({
          checkoutUrl: 'https://pay.payos.vn/web/abc',
        }),
      },
      webhooks: { verify: jest.fn() },
    };
    const provider = new PayosPaymentProvider(
      config,
      payos as unknown as PayOS,
    );

    const { paymentUrl } = await provider.createCheckout({
      amountVnd: '199000',
      txnRef: '1730000000000123',
      orderId: 'order-1',
      orderInfo: 'Payment for a very long order description that exceeds limit',
      ipAddr: '127.0.0.1',
      returnUrl: 'http://localhost:3000/payments/payos/return',
      cancelUrl: 'http://localhost:3000/payments/payos/return',
      paymentId: 'pay-1',
    });

    expect(paymentUrl).toBe('https://pay.payos.vn/web/abc');
    expect(payos.paymentRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderCode: 1730000000000123,
        amount: 199000,
        description: 'Payment for a very long o',
        returnUrl: 'http://localhost:3000/payments/payos/return',
        cancelUrl: 'http://localhost:3000/payments/payos/return',
      }),
    );
  });

  it('maps verifyReturn query into ProviderVerifyResult', async () => {
    const provider = new PayosPaymentProvider(config);
    const result = await provider.verifyReturn({
      code: '00',
      orderCode: '123',
      status: 'PAID',
      id: 'plink-1',
    });
    expect(result).toMatchObject({
      ok: true,
      success: true,
      txnRef: '123',
      responseCode: '00',
      providerTransactionId: 'plink-1',
    });
  });

  it('maps verifyIpn via webhooks.verify', async () => {
    const payos = {
      paymentRequests: { create: jest.fn() },
      webhooks: {
        verify: jest.fn().mockResolvedValue({
          orderCode: 123,
          amount: 3000,
          code: '00',
          reference: 'TF1',
          paymentLinkId: 'plink',
          counterAccountBankId: '970422',
        }),
      },
    };
    const provider = new PayosPaymentProvider(
      config,
      payos as unknown as PayOS,
    );

    const body = {
      code: '00',
      desc: 'success',
      success: true,
      data: {},
      signature: 'sig',
    };
    const result = await provider.verifyIpn(body);

    expect(payos.webhooks.verify).toHaveBeenCalledWith(body);
    expect(result).toMatchObject({
      ok: true,
      success: true,
      txnRef: '123',
      amountVnd: '3000',
      responseCode: '00',
      providerTransactionId: 'TF1',
      bankCode: '970422',
    });
  });

  it('returns ok=false when webhook verify throws', async () => {
    const payos = {
      paymentRequests: { create: jest.fn() },
      webhooks: {
        verify: jest.fn().mockRejectedValue(new Error('bad signature')),
      },
    };
    const provider = new PayosPaymentProvider(
      config,
      payos as unknown as PayOS,
    );

    const result = await provider.verifyIpn({});
    expect(result).toMatchObject({ ok: false, success: false, txnRef: '' });
  });
});
