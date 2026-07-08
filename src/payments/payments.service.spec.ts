import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { VnpayService } from 'nestjs-vnpay';
import {
  InpOrderAlreadyConfirmed,
  IpnFailChecksum,
  IpnInvalidAmount,
  IpnOrderNotFound,
  IpnSuccess,
} from 'vnpay';
import { AppConfigService } from '../config/config.service';
import { Order } from '../commerce/order.entity';
import { OrderStatus } from '../commerce/enums';
import { Customer } from '../users/customer.entity';
import { PaymentsService } from './payments.service';
import { Payment } from './payment.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentAttemptStatus, PaymentClient, PaymentStatus } from './enums';

const PAYMENT_CONFIG = {
  tmnCode: 'TMN',
  hashSecret: 'SECRET',
  vnpayHost: 'https://sandbox.vnpayment.vn',
  returnUrl: 'http://localhost:3000/payments/vnpay/return',
  ipnUrl: '',
  clientReturnUrl: 'http://localhost:3000/vnpay_return',
  mobileReturnUrl: 'glowscan://vnpay-return',
};

type Mocked<T> = { [K in keyof T]: jest.Mock };

const makeConfig = () =>
  ({
    paymentConfig: PAYMENT_CONFIG,
    nodeEnv: 'test',
  }) as unknown as AppConfigService;

describe('PaymentsService', () => {
  let paymentRepo: Mocked<
    Pick<Repository<Payment>, 'findOne' | 'create' | 'save'>
  >;
  let attemptRepo: Mocked<
    Pick<Repository<PaymentAttempt>, 'findOne' | 'create' | 'save'>
  >;
  let orderRepo: Mocked<Pick<Repository<Order>, 'findOne'>>;
  let customerRepo: Mocked<Pick<Repository<Customer>, 'findOne'>>;
  let vnpay: Mocked<
    Pick<VnpayService, 'buildPaymentUrl' | 'verifyReturnUrl' | 'verifyIpnCall'>
  >;
  let dataSource: { transaction: jest.Mock };
  let service: PaymentsService;

  beforeEach(() => {
    paymentRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    attemptRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    orderRepo = { findOne: jest.fn() };
    customerRepo = { findOne: jest.fn() };
    vnpay = {
      buildPaymentUrl: jest.fn(),
      verifyReturnUrl: jest.fn(),
      verifyIpnCall: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };

    service = new PaymentsService(
      paymentRepo as unknown as Repository<Payment>,
      attemptRepo as unknown as Repository<PaymentAttempt>,
      orderRepo as unknown as Repository<Order>,
      customerRepo as unknown as Repository<Customer>,
      vnpay as unknown as VnpayService,
      makeConfig(),
      dataSource as unknown as DataSource,
    );
  });

  describe('checkout', () => {
    it('creates a payment + attempt and returns the built VNPay URL', async () => {
      customerRepo.findOne.mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
      });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        totalVnd: 199000,
      });
      paymentRepo.findOne.mockResolvedValue(null);
      paymentRepo.create.mockImplementation((v) => v);
      paymentRepo.save.mockImplementation((v) =>
        Promise.resolve({ ...v, id: 'pay-1' }),
      );
      attemptRepo.create.mockImplementation((v) => v);
      attemptRepo.save.mockImplementation((v) => Promise.resolve(v));
      vnpay.buildPaymentUrl.mockReturnValue('https://vnpay/pay?x=1');

      const result = await service.checkout(
        'user-1',
        { orderId: 'order-1' },
        '127.0.0.1',
      );

      expect(result).toEqual({
        paymentId: 'pay-1',
        paymentUrl: 'https://vnpay/pay?x=1',
      });
      const built = vnpay.buildPaymentUrl.mock.calls[0][0];
      expect(built.vnp_Amount).toBe(199000);
      expect(built.vnp_ReturnUrl).toBe(PAYMENT_CONFIG.returnUrl);
      // Attempt saved with a vnpTxnRef and PENDING status.
      const savedAttempt = attemptRepo.save.mock.calls[0][0];
      expect(savedAttempt.vnpTxnRef).toEqual(expect.any(String));
      expect(savedAttempt.status).toBe(PaymentAttemptStatus.PENDING);
    });

    it('uses the mobile return URL when client=mobile', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        totalVnd: 50000,
      });
      paymentRepo.findOne.mockResolvedValue(null);
      paymentRepo.create.mockImplementation((v) => v);
      paymentRepo.save.mockImplementation((v) =>
        Promise.resolve({ ...v, id: 'pay-1' }),
      );
      attemptRepo.create.mockImplementation((v) => v);
      attemptRepo.save.mockImplementation((v) => Promise.resolve(v));
      vnpay.buildPaymentUrl.mockReturnValue('url');

      await service.checkout(
        'user-1',
        { orderId: 'order-1', client: PaymentClient.MOBILE },
        '1.1.1.1',
      );

      const created = paymentRepo.create.mock.calls[0][0];
      expect(created.clientReturnUrl).toBe(PAYMENT_CONFIG.mobileReturnUrl);
    });

    it('rejects an order that does not belong to the caller', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'other',
        status: OrderStatus.PENDING,
        totalVnd: 1000,
      });

      await expect(
        service.checkout('user-1', { orderId: 'order-1' }, '1.1.1.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-pending order', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PAID,
        totalVnd: 1000,
      });

      await expect(
        service.checkout('user-1', { orderId: 'order-1' }, '1.1.1.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the order is missing', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.checkout('user-1', { orderId: 'missing' }, '1.1.1.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleReturn (read-only)', () => {
    it('redirects to the stored client URL with paymentId, without mutating', async () => {
      vnpay.verifyReturnUrl.mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'ref-1',
      });
      attemptRepo.findOne.mockResolvedValue({
        paymentId: 'pay-1',
        payment: { clientReturnUrl: 'http://web/return' },
      });

      const { redirectUrl } = await service.handleReturn({} as never);

      expect(redirectUrl).toContain('http://web/return');
      expect(redirectUrl).toContain('paymentId=pay-1');
      expect(redirectUrl).toContain('status=success');
      // No writes happened.
      expect(attemptRepo.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('falls back to the default client URL on an unverified return', async () => {
      vnpay.verifyReturnUrl.mockResolvedValue({
        isVerified: false,
        isSuccess: false,
        vnp_TxnRef: 'ref-x',
      });
      attemptRepo.findOne.mockResolvedValue(null);

      const { redirectUrl } = await service.handleReturn({} as never);

      expect(redirectUrl).toContain(PAYMENT_CONFIG.clientReturnUrl);
      expect(redirectUrl).toContain('status=invalid');
    });
  });

  describe('handleIpn (idempotent)', () => {
    const runTransaction = () =>
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) =>
          cb({ update: managerUpdate }),
      );
    let managerUpdate: jest.Mock;

    beforeEach(() => {
      managerUpdate = jest.fn();
    });

    it('returns FailChecksum and does not touch the DB on bad signature', async () => {
      vnpay.verifyIpnCall.mockResolvedValue({ isVerified: false });

      const res = await service.handleIpn({} as never);

      expect(res).toBe(IpnFailChecksum);
      expect(attemptRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('returns OrderNotFound for an unknown txnRef', async () => {
      vnpay.verifyIpnCall.mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'nope',
      });
      attemptRepo.findOne.mockResolvedValue(null);

      const res = await service.handleIpn({} as never);
      expect(res).toBe(IpnOrderNotFound);
    });

    it('returns InvalidAmount when amounts differ', async () => {
      vnpay.verifyIpnCall.mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'ref-1',
        vnp_Amount: 500,
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        amountVnd: '199000',
      });

      const res = await service.handleIpn({} as never);
      expect(res).toBe(IpnInvalidAmount);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('marks attempt + payment paid on a successful first IPN', async () => {
      vnpay.verifyIpnCall.mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'ref-1',
        vnp_Amount: 199000,
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '12345',
        vnp_BankCode: 'NCB',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate
        .mockResolvedValueOnce({ affected: 1 }) // attempt PENDING -> SUCCESS
        .mockResolvedValueOnce({ affected: 1 }); // payment -> PAID

      const res = await service.handleIpn({} as never);

      expect(res).toBe(IpnSuccess);
      const attemptValues = managerUpdate.mock.calls[0][2];
      expect(attemptValues.status).toBe(PaymentAttemptStatus.SUCCESS);
      const paymentValues = managerUpdate.mock.calls[1][2];
      expect(paymentValues.status).toBe(PaymentStatus.PAID);
    });

    it('is idempotent: a duplicate IPN affects 0 rows and returns AlreadyConfirmed', async () => {
      vnpay.verifyIpnCall.mockResolvedValue({
        isVerified: true,
        isSuccess: true,
        vnp_TxnRef: 'ref-1',
        vnp_Amount: 199000,
        vnp_ResponseCode: '00',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate.mockResolvedValueOnce({ affected: 0 }); // already terminal

      const res = await service.handleIpn({} as never);

      expect(res).toBe(InpOrderAlreadyConfirmed);
      // Only the conditional attempt update ran — payment was never updated again.
      expect(managerUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('returns status for the owning customer', async () => {
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        status: PaymentStatus.PAID,
        provider: 'VNPAY',
        amountVnd: '199000',
        paidAt: null,
        order: { customerId: 'cust-1' },
      });
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });

      const res = await service.getStatus('user-1', 'pay-1');
      expect(res.id).toBe('pay-1');
      expect(res.status).toBe(PaymentStatus.PAID);
    });

    it('forbids a non-owner', async () => {
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        order: { customerId: 'someone-else' },
      });
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });

      await expect(service.getStatus('user-1', 'pay-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
