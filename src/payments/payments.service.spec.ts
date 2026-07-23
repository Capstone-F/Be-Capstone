import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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
import {
  PaymentAttemptStatus,
  PaymentClient,
  PaymentProvider,
  PaymentStatus,
} from './enums';
import { PaymentGateway } from './providers/payment-provider.types';

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

const makeConfig = (provider = 'vnpay') =>
  ({
    paymentConfig: PAYMENT_CONFIG,
    paymentProvider: provider,
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
  let gateway: jest.Mocked<PaymentGateway>;
  let dataSource: { transaction: jest.Mock };
  let stockService: { deductByVariantId: jest.Mock };
  let service: PaymentsService;

  beforeEach(() => {
    paymentRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    attemptRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    orderRepo = { findOne: jest.fn() };
    customerRepo = { findOne: jest.fn() };
    gateway = {
      code: PaymentProvider.VNPAY,
      createCheckout: jest.fn(),
      verifyReturn: jest.fn(),
      verifyIpn: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };
    stockService = { deductByVariantId: jest.fn().mockResolvedValue({}) };

    service = new PaymentsService(
      paymentRepo as unknown as Repository<Payment>,
      attemptRepo as unknown as Repository<PaymentAttempt>,
      orderRepo as unknown as Repository<Order>,
      customerRepo as unknown as Repository<Customer>,
      gateway,
      makeConfig(),
      dataSource as unknown as DataSource,
      stockService as never,
    );
  });

  describe('checkout', () => {
    it('creates a payment + attempt and returns the gateway payment URL', async () => {
      customerRepo.findOne.mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
      });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        totalVnd: 199000,
        delivery: { id: 'del-1' },
      });
      paymentRepo.findOne.mockResolvedValue(null);
      paymentRepo.create.mockImplementation((v) => v);
      paymentRepo.save.mockImplementation((v) =>
        Promise.resolve({ ...v, id: 'pay-1' }),
      );
      attemptRepo.create.mockImplementation((v) => v);
      attemptRepo.save.mockImplementation((v) => Promise.resolve(v));
      gateway.createCheckout.mockResolvedValue({
        paymentUrl: 'https://vnpay/pay?x=1',
      });

      const result = await service.checkout(
        'user-1',
        { orderId: 'order-1' },
        '127.0.0.1',
      );

      expect(result).toEqual({
        paymentId: 'pay-1',
        paymentUrl: 'https://vnpay/pay?x=1',
      });
      const input = gateway.createCheckout.mock.calls[0][0];
      expect(input.amountVnd).toBe('199000');
      expect(input.returnUrl).toBe(PAYMENT_CONFIG.returnUrl);
      expect(input.paymentId).toBe('pay-1');
      const savedAttempt = attemptRepo.save.mock.calls[0][0];
      expect(savedAttempt.vnpTxnRef).toEqual(expect.any(String));
      expect(savedAttempt.status).toBe(PaymentAttemptStatus.PENDING);
      const createdPayment = paymentRepo.create.mock.calls[0][0];
      expect(createdPayment.provider).toBe(PaymentProvider.VNPAY);
    });

    it('uses the mobile return URL when client=mobile', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        totalVnd: 50000,
        delivery: { id: 'del-1' },
      });
      paymentRepo.findOne.mockResolvedValue(null);
      paymentRepo.create.mockImplementation((v) => v);
      paymentRepo.save.mockImplementation((v) =>
        Promise.resolve({ ...v, id: 'pay-1' }),
      );
      attemptRepo.create.mockImplementation((v) => v);
      attemptRepo.save.mockImplementation((v) => Promise.resolve(v));
      gateway.createCheckout.mockResolvedValue({ paymentUrl: 'url' });

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
        delivery: { id: 'del-1' },
      });

      await expect(
        service.checkout('user-1', { orderId: 'order-1' }, '1.1.1.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an order without shipping selection', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        totalVnd: 199000,
        delivery: null,
      });

      await expect(
        service.checkout('user-1', { orderId: 'order-1' }, '1.1.1.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('charges products + shipping via order.totalVnd', async () => {
      customerRepo.findOne.mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
      });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        status: OrderStatus.PENDING,
        subtotalVnd: 200000,
        discountVnd: 20000,
        shippingFeeVnd: 30000,
        totalVnd: 210000,
        delivery: { id: 'del-1', feeVnd: 30000 },
      });
      paymentRepo.findOne.mockResolvedValue(null);
      paymentRepo.create.mockImplementation((v) => v);
      paymentRepo.save.mockImplementation((v) =>
        Promise.resolve({ ...v, id: 'pay-1' }),
      );
      attemptRepo.create.mockImplementation((v) => v);
      attemptRepo.save.mockImplementation((v) => Promise.resolve(v));
      gateway.createCheckout.mockResolvedValue({
        paymentUrl: 'https://vnpay/pay?x=1',
      });

      await service.checkout('user-1', { orderId: 'order-1' }, '127.0.0.1');

      expect(gateway.createCheckout.mock.calls[0][0].amountVnd).toBe('210000');
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
      gateway.verifyReturn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: 'ref-1',
      });
      attemptRepo.findOne.mockResolvedValue({
        paymentId: 'pay-1',
        payment: { clientReturnUrl: 'http://web/return' },
      });

      const { redirectUrl } = await service.handleReturn({} as never);

      expect(redirectUrl).toContain('http://web/return');
      expect(redirectUrl).toContain('paymentId=pay-1');
      expect(redirectUrl).toContain('status=success');
      expect(attemptRepo.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('falls back to the default client URL on an unverified return', async () => {
      gateway.verifyReturn.mockResolvedValue({
        ok: false,
        success: false,
        txnRef: 'ref-x',
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
          cb({
            update: managerUpdate,
            findOne: jest.fn().mockResolvedValue({
              id: 'pay-1',
              orderId: 'order-1',
            }),
          }),
      );
    let managerUpdate: jest.Mock;

    beforeEach(() => {
      managerUpdate = jest.fn();
      orderRepo.findOne.mockResolvedValue({ id: 'order-1', items: [] });
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
      });
    });

    it('returns FailChecksum and does not touch the DB on bad signature', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: false,
        success: false,
        txnRef: '',
      });

      const res = await service.handleIpn({} as never);

      expect(res).toBe(IpnFailChecksum);
      expect(attemptRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('returns OrderNotFound for an unknown txnRef', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: 'nope',
      });
      attemptRepo.findOne.mockResolvedValue(null);

      const res = await service.handleIpn({} as never);
      expect(res).toBe(IpnOrderNotFound);
    });

    it('returns InvalidAmount when amounts differ', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: 'ref-1',
        amountVnd: '500',
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
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: 'ref-1',
        amountVnd: '199000',
        responseCode: '00',
        providerTransactionId: '12345',
        bankCode: 'NCB',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 });

      const res = await service.handleIpn({} as never);

      expect(res).toBe(IpnSuccess);
      const attemptValues = managerUpdate.mock.calls[0][2];
      expect(attemptValues.status).toBe(PaymentAttemptStatus.SUCCESS);
      const paymentValues = managerUpdate.mock.calls[1][2];
      expect(paymentValues.status).toBe(PaymentStatus.PAID);
      const orderValues = managerUpdate.mock.calls[2][2];
      expect(orderValues.status).toBe(OrderStatus.PAID);
    });

    it('is idempotent: a duplicate IPN affects 0 rows and returns AlreadyConfirmed', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: 'ref-1',
        amountVnd: '199000',
        responseCode: '00',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate.mockResolvedValueOnce({ affected: 0 });

      const res = await service.handleIpn({} as never);

      expect(res).toBe(InpOrderAlreadyConfirmed);
      expect(managerUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMockComplete', () => {
    let managerUpdate: jest.Mock;

    beforeEach(() => {
      gateway.code = PaymentProvider.MOCK;
      Object.defineProperty(gateway, 'code', {
        value: PaymentProvider.MOCK,
        writable: true,
      });
      service = new PaymentsService(
        paymentRepo as unknown as Repository<Payment>,
        attemptRepo as unknown as Repository<PaymentAttempt>,
        orderRepo as unknown as Repository<Order>,
        customerRepo as unknown as Repository<Customer>,
        { ...gateway, code: PaymentProvider.MOCK },
        makeConfig('mock'),
        dataSource as unknown as DataSource,
        stockService as never,
      );
      managerUpdate = jest.fn();
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) =>
          cb({
            update: managerUpdate,
            findOne: jest.fn().mockResolvedValue({
              id: 'pay-1',
              orderId: 'order-1',
            }),
          }),
      );
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'oi-1', productVariantId: 'var-1', quantity: 2 }],
      });
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
      });
    });

    it('finalizes payment, deducts stock, and redirects to client', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
        payment: { clientReturnUrl: 'http://web/return' },
      });
      managerUpdate
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 });

      const { redirectUrl } = await service.handleMockComplete(
        'pay-1',
        'ref-1',
      );

      expect(redirectUrl).toContain('status=success');
      expect(redirectUrl).toContain('paymentId=pay-1');
      expect(stockService.deductByVariantId).toHaveBeenCalledWith(
        'var-1',
        2,
        expect.stringContaining('pay-1'),
        'oi-1',
      );
    });

    it('is idempotent on duplicate mock complete', async () => {
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
        payment: { clientReturnUrl: 'http://web/return' },
      });
      managerUpdate.mockResolvedValueOnce({ affected: 0 });

      const { redirectUrl } = await service.handleMockComplete(
        'pay-1',
        'ref-1',
      );

      expect(redirectUrl).toContain('status=success');
      expect(stockService.deductByVariantId).not.toHaveBeenCalled();
    });

    it('throws NotFound when mock provider is not active', async () => {
      service = new PaymentsService(
        paymentRepo as unknown as Repository<Payment>,
        attemptRepo as unknown as Repository<PaymentAttempt>,
        orderRepo as unknown as Repository<Order>,
        customerRepo as unknown as Repository<Customer>,
        { ...gateway, code: PaymentProvider.VNPAY },
        makeConfig('vnpay'),
        dataSource as unknown as DataSource,
        stockService as never,
      );

      await expect(
        service.handleMockComplete('pay-1', 'ref-1'),
      ).rejects.toThrow(NotFoundException);
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
