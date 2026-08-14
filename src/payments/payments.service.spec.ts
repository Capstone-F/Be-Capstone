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
};

const CLIENT_RETURN_URL = 'http://localhost:3000/vnpay_return';
const MOBILE_RETURN_URL = 'glowscan://vnpay-return';

const PAYOS_CONFIG = {
  clientId: 'payos-client',
  apiKey: 'payos-key',
  checksumKey: 'payos-checksum',
  returnUrl: 'http://localhost:3000/payments/payos/return',
  cancelUrl: 'http://localhost:3000/payments/payos/return',
  webhookUrl: '',
};

type Mocked<T> = { [K in keyof T]: jest.Mock };

const makeConfig = (provider = 'vnpay') =>
  ({
    paymentConfig: PAYMENT_CONFIG,
    payosConfig: PAYOS_CONFIG,
    clientReturnUrl: CLIENT_RETURN_URL,
    mobileReturnUrl: MOBILE_RETURN_URL,
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
  let deliveryService: { createGhnOrderForPaidOrder: jest.Mock };
  let walletService: {
    getOrCreateWallet: jest.Mock;
    creditWithManager: jest.Mock;
    debitWithManager: jest.Mock;
  };
  let commerceAnalyticsService: { recordPurchaseWithManager: jest.Mock };
  let service: PaymentsService;

  beforeEach(() => {
    paymentRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    attemptRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    orderRepo = { findOne: jest.fn() };
    customerRepo = { findOne: jest.fn() };
    gateway = {
      code: PaymentProvider.VNPAY,
      createTxnRef: jest.fn().mockReturnValue('txn-ref-1'),
      createCheckout: jest.fn(),
      verifyReturn: jest.fn(),
      verifyIpn: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };
    stockService = { deductByVariantId: jest.fn().mockResolvedValue({}) };
    deliveryService = {
      createGhnOrderForPaidOrder: jest.fn().mockResolvedValue(undefined),
    };

    walletService = {
      getOrCreateWallet: jest
        .fn()
        .mockResolvedValue({ id: 'w-1', balanceVnd: '0' }),
      creditWithManager: jest.fn().mockResolvedValue({ id: 'tx-topup' }),
      debitWithManager: jest.fn().mockResolvedValue({ id: 'tx-order' }),
    };
    commerceAnalyticsService = { recordPurchaseWithManager: jest.fn() };

    service = new PaymentsService(
      paymentRepo as unknown as Repository<Payment>,
      attemptRepo as unknown as Repository<PaymentAttempt>,
      orderRepo as unknown as Repository<Order>,
      customerRepo as unknown as Repository<Customer>,
      gateway,
      makeConfig(),
      dataSource as unknown as DataSource,
      stockService as never,
      deliveryService as never,
      commerceAnalyticsService as never,
      walletService as never,
    );
  });

  describe('checkoutWithWallet', () => {
    type WalletManagerMock = {
      manager: {
        getRepository: jest.Mock;
        find: jest.Mock;
        create: jest.Mock;
        save: jest.Mock;
        update: jest.Mock;
      };
      lockedOrder: jest.Mock;
    };

    const mockWalletTransaction = (
      lockedOrder: Record<string, unknown> | null,
      openPayments: Array<Record<string, unknown>> = [],
    ): WalletManagerMock => {
      const getOne = jest.fn().mockResolvedValue(lockedOrder);
      const manager = {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne,
          }),
        }),
        find: jest.fn().mockResolvedValue(openPayments),
        create: jest.fn().mockImplementation((_entity, v) => v),
        save: jest
          .fn()
          .mockImplementation((_entity, v) =>
            Promise.resolve({ ...(v as object), id: 'pay-w-1' }),
          ),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) => cb(manager),
      );
      return { manager, lockedOrder: getOne };
    };

    const pendingOrder = {
      id: 'order-1',
      customerId: 'cust-1',
      status: OrderStatus.PENDING,
      totalVnd: 210000,
      delivery: { id: 'del-1' },
    };

    beforeEach(() => {
      customerRepo.findOne.mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
      });
      orderRepo.findOne.mockResolvedValue(pendingOrder);
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-w-1',
        orderId: 'order-1',
      });
    });

    it('debits the wallet, marks payment + order PAID, and runs side effects', async () => {
      const { manager } = mockWalletTransaction(pendingOrder);
      walletService.getOrCreateWallet.mockResolvedValue({
        id: 'w-1',
        balanceVnd: '90000',
      });
      orderRepo.findOne.mockResolvedValueOnce(pendingOrder).mockResolvedValue({
        ...pendingOrder,
        items: [{ id: 'oi-1', productVariantId: 'var-1', quantity: 2 }],
      });

      const result = await service.checkoutWithWallet('user-1', {
        orderId: 'order-1',
      });

      expect(result).toEqual({
        paymentId: 'pay-w-1',
        orderId: 'order-1',
        status: PaymentStatus.PAID,
        amountVnd: '210000',
        transactionId: 'tx-order',
        walletBalanceVnd: '90000',
        paidAt: expect.any(Date),
      });

      const createdPayment = manager.create.mock.calls[0][1];
      expect(createdPayment).toMatchObject({
        orderId: 'order-1',
        provider: PaymentProvider.WALLET,
        status: PaymentStatus.PAID,
        amountVnd: '210000',
      });

      expect(walletService.debitWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          amountVnd: 210000,
          userId: 'user-1',
          orderId: 'order-1',
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: 'order-1', status: OrderStatus.PENDING },
        { status: OrderStatus.PAID },
      );
      expect(
        commerceAnalyticsService.recordPurchaseWithManager,
      ).toHaveBeenCalled();
      expect(stockService.deductByVariantId).toHaveBeenCalledWith(
        'var-1',
        2,
        expect.any(String),
        'oi-1',
      );
      expect(deliveryService.createGhnOrderForPaidOrder).toHaveBeenCalledWith(
        'order-1',
      );
    });

    it('cancels open gateway payments so a late IPN cannot fulfil twice', async () => {
      const { manager } = mockWalletTransaction(pendingOrder, [
        { id: 'pay-gw-1' },
      ]);

      await service.checkoutWithWallet('user-1', { orderId: 'order-1' });

      expect(manager.update).toHaveBeenCalledWith(
        PaymentAttempt,
        expect.objectContaining({ status: PaymentAttemptStatus.PENDING }),
        expect.objectContaining({ status: PaymentAttemptStatus.FAILED }),
      );
      expect(manager.update).toHaveBeenCalledWith(Payment, expect.anything(), {
        status: PaymentStatus.CANCELLED,
      });
    });

    it('propagates insufficient balance and leaves the order unpaid', async () => {
      const { manager } = mockWalletTransaction(pendingOrder);
      walletService.debitWithManager.mockRejectedValue(
        new BadRequestException('Số dư ví không đủ'),
      );

      await expect(
        service.checkoutWithWallet('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow(BadRequestException);

      expect(manager.update).not.toHaveBeenCalledWith(
        Order,
        expect.anything(),
        { status: OrderStatus.PAID },
      );
      expect(deliveryService.createGhnOrderForPaidOrder).not.toHaveBeenCalled();
    });

    it('rejects when the order was paid between the guard and the lock', async () => {
      mockWalletTransaction({ ...pendingOrder, status: OrderStatus.PAID });

      await expect(
        service.checkoutWithWallet('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(walletService.debitWithManager).not.toHaveBeenCalled();
    });

    it('rejects an order that does not belong to the caller', async () => {
      orderRepo.findOne.mockResolvedValue({
        ...pendingOrder,
        customerId: 'other',
      });

      await expect(
        service.checkoutWithWallet('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an order without shipping selection', async () => {
      orderRepo.findOne.mockResolvedValue({ ...pendingOrder, delivery: null });

      await expect(
        service.checkoutWithWallet('user-1', { orderId: 'order-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the order is missing', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.checkoutWithWallet('user-1', { orderId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });
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
      expect(created.clientReturnUrl).toBe(MOBILE_RETURN_URL);
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

      const { redirectUrl } = await service.handleReturn({});

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

      const { redirectUrl } = await service.handleReturn({});

      expect(redirectUrl).toContain(CLIENT_RETURN_URL);
      expect(redirectUrl).toContain('status=invalid');
    });
  });

  describe('handlePayosWebhook', () => {
    const runTransaction = () =>
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) =>
          cb({
            update: managerUpdate,
            findOne: jest.fn().mockResolvedValue({
              id: 'pay-1',
              orderId: 'order-1',
              purpose: 'ORDER',
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
        purpose: 'ORDER',
      });
    });

    it('returns invalid signature and does not touch the DB on bad verify', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: false,
        success: false,
        txnRef: '',
      });

      const res = await service.handlePayosWebhook({});

      expect(res).toEqual({ code: '01', desc: 'invalid signature' });
      expect(attemptRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('finalizes and returns success', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: '123456',
        amountVnd: '199000',
        responseCode: '00',
        providerTransactionId: 'ref-1',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate.mockResolvedValue({ affected: 1 });

      const res = await service.handlePayosWebhook({
        code: '00',
        data: { orderCode: 123456 },
      });

      expect(res).toEqual({ code: '00', desc: 'success' });
      expect(deliveryService.createGhnOrderForPaidOrder).toHaveBeenCalledWith(
        'order-1',
      );
    });

    it('acks duplicates as success', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: true,
        success: true,
        txnRef: '123456',
        amountVnd: '199000',
      });
      attemptRepo.findOne.mockResolvedValue({
        id: 'att-1',
        paymentId: 'pay-1',
        amountVnd: '199000',
      });
      runTransaction();
      managerUpdate.mockResolvedValue({ affected: 0 });

      const res = await service.handlePayosWebhook({});
      expect(res).toEqual({ code: '00', desc: 'success' });
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
              purpose: 'ORDER',
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
        purpose: 'ORDER',
      });
    });

    it('returns FailChecksum and does not touch the DB on bad signature', async () => {
      gateway.verifyIpn.mockResolvedValue({
        ok: false,
        success: false,
        txnRef: '',
      });

      const res = await service.handleIpn({});

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

      const res = await service.handleIpn({});
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

      const res = await service.handleIpn({});
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

      const res = await service.handleIpn({});

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

      const res = await service.handleIpn({});

      expect(res).toBe(InpOrderAlreadyConfirmed);
      expect(managerUpdate).toHaveBeenCalledTimes(1);
      // The idempotency gate must also stop the side effects.
      expect(stockService.deductByVariantId).not.toHaveBeenCalled();
      expect(deliveryService.createGhnOrderForPaidOrder).not.toHaveBeenCalled();
    });

    it('hands the paid order to GHN after a successful IPN', async () => {
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
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
      });
      orderRepo.findOne.mockResolvedValue({ id: 'order-1', items: [] });
      runTransaction();
      managerUpdate.mockResolvedValue({ affected: 1 });

      const res = await service.handleIpn({});

      expect(res).toBe(IpnSuccess);
      expect(deliveryService.createGhnOrderForPaidOrder).toHaveBeenCalledWith(
        'order-1',
      );
    });

    it('still acks the IPN when GHN order creation fails', async () => {
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
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
      });
      orderRepo.findOne.mockResolvedValue({ id: 'order-1', items: [] });
      runTransaction();
      managerUpdate.mockResolvedValue({ affected: 1 });
      deliveryService.createGhnOrderForPaidOrder.mockRejectedValue(
        new Error('GHN down'),
      );

      // A GHN outage must not turn a confirmed payment into IpnUnknownError,
      // which would make VNPay retry an already-settled payment.
      await expect(service.handleIpn({})).resolves.toBe(IpnSuccess);
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
        deliveryService as never,
        { recordPurchaseWithManager: jest.fn() } as never,
        {
          getOrCreateWallet: jest.fn(),
          creditWithManager: jest.fn(),
        } as never,
      );
      managerUpdate = jest.fn();
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) =>
          cb({
            update: managerUpdate,
            findOne: jest.fn().mockResolvedValue({
              id: 'pay-1',
              orderId: 'order-1',
              purpose: 'ORDER',
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
        purpose: 'ORDER',
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
        deliveryService as never,
        { recordPurchaseWithManager: jest.fn() } as never,
        {
          getOrCreateWallet: jest.fn(),
          creditWithManager: jest.fn(),
        } as never,
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
        purpose: 'ORDER',
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
      expect(res.purpose).toBe('ORDER');
    });

    it('forbids a non-owner', async () => {
      paymentRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        purpose: 'ORDER',
        order: { customerId: 'someone-else' },
      });
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });

      await expect(service.getStatus('user-1', 'pay-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
