import { AppConfigService } from '../../config/config.service';
import { PaymentProvider } from '../enums';
import { MockPaymentProvider } from './mock.payment-provider';

describe('MockPaymentProvider', () => {
  it('builds mock complete URL from VNP_RETURN_URL origin and path prefix', async () => {
    const config = {
      paymentConfig: {
        returnUrl: 'http://localhost:3000/api/payments/vnpay/return',
      },
      port: 3000,
    } as unknown as AppConfigService;
    const provider = new MockPaymentProvider(config);

    expect(provider.code).toBe(PaymentProvider.MOCK);
    const { paymentUrl } = await provider.createCheckout({
      amountVnd: '1000',
      txnRef: 'ref-1',
      orderId: 'order-1',
      ipAddr: '127.0.0.1',
      returnUrl: config.paymentConfig.returnUrl,
      paymentId: 'pay-1',
    });

    expect(paymentUrl).toBe(
      'http://localhost:3000/api/payments/mock/complete?paymentId=pay-1&txnRef=ref-1',
    );
  });
});
