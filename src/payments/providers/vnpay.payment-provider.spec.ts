import { VnpayService } from 'nestjs-vnpay';
import { PaymentProvider } from '../enums';
import { VnpayPaymentProvider } from './vnpay.payment-provider';

describe('VnpayPaymentProvider', () => {
  it('delegates createCheckout to VnpayService.buildPaymentUrl', async () => {
    const vnpay = {
      buildPaymentUrl: jest.fn().mockReturnValue('https://vnpay/pay'),
      verifyReturnUrl: jest.fn(),
      verifyIpnCall: jest.fn(),
    };
    const provider = new VnpayPaymentProvider(vnpay as unknown as VnpayService);

    expect(provider.code).toBe(PaymentProvider.VNPAY);
    const { paymentUrl } = await provider.createCheckout({
      amountVnd: '199000',
      txnRef: 'ref-1',
      orderId: 'order-1',
      ipAddr: '127.0.0.1',
      returnUrl: 'http://localhost:3000/payments/vnpay/return',
      paymentId: 'pay-1',
    });

    expect(paymentUrl).toBe('https://vnpay/pay');
    expect(vnpay.buildPaymentUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        vnp_Amount: 199000,
        vnp_TxnRef: 'ref-1',
        vnp_ReturnUrl: 'http://localhost:3000/payments/vnpay/return',
      }),
    );
  });

  it('maps verifyReturn into ProviderVerifyResult', async () => {
    const vnpay = {
      buildPaymentUrl: jest.fn(),
      verifyReturnUrl: jest.fn().mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'ref-1',
        vnp_Amount: 199000,
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '9',
        vnp_BankCode: 'NCB',
      }),
      verifyIpnCall: jest.fn(),
    };
    const provider = new VnpayPaymentProvider(vnpay as unknown as VnpayService);

    const result = await provider.verifyReturn({ foo: 'bar' });
    expect(result).toMatchObject({
      ok: true,
      success: true,
      txnRef: 'ref-1',
      amountVnd: '199000',
      responseCode: '00',
      providerTransactionId: '9',
      bankCode: 'NCB',
    });
  });
});
