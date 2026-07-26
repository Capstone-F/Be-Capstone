/**
 * VNPay payment flow — credential-free integration test.
 *
 * Drives the real PaymentsService against the real VnpayService (genuine HMAC-SHA512
 * signing/verification) with in-memory repositories. No database or network needed.
 * Proves the whole state machine: signed checkout URL, read-only return, and an
 * idempotent IPN that is the sole status-updater, plus the three rejection paths.
 */
import { Repository, DataSource, EntityManager } from 'typeorm';
import { VnpayService } from 'nestjs-vnpay';
import {
  HashAlgorithm,
  ignoreLogger,
  buildPaymentUrlSearchParams,
  calculateSecureHash,
} from 'vnpay';
import { AppConfigService } from '../src/config/config.service';
import { OrderStatus } from '../src/commerce/enums';
import { Order } from '../src/commerce/order.entity';
import { Customer } from '../src/users/customer.entity';
import { VnpayPaymentProvider } from '../src/payments/providers/vnpay.payment-provider';
import { MockPaymentProvider } from '../src/payments/providers/mock.payment-provider';
import { PaymentsService } from '../src/payments/payments.service';
import { Payment } from '../src/payments/payment.entity';
import { PaymentAttempt } from '../src/payments/payment-attempt.entity';
import { PaymentStatus } from '../src/payments/enums';

const TMN = 'DEMOTMN1';
const SECRET = 'DEMOSECRET0123456789';

const PAYMENT_CONFIG = {
  tmnCode: TMN,
  hashSecret: SECRET,
  vnpayHost: 'https://sandbox.vnpayment.vn',
  returnUrl: 'http://localhost:3000/payments/vnpay/return',
  ipnUrl: '',
  clientReturnUrl: 'http://localhost:3000/vnpay_return',
  mobileReturnUrl: 'glowscan://vnpay-return',
};

/** Forge a validly-signed VNPay callback (return and IPN share the format). */
function signCallback(fields: Record<string, unknown>): Record<string, string> {
  const params = buildPaymentUrlSearchParams(fields);
  const vnp_SecureHash = calculateSecureHash({
    secureSecret: SECRET,
    data: params.toString(),
    hashAlgorithm: HashAlgorithm.SHA512,
    bufferEncode: 'utf-8',
  });
  return { ...Object.fromEntries(params), vnp_SecureHash };
}

function successCallback(
  txnRef: string,
  amountVndX100: number,
): Record<string, string> {
  return signCallback({
    vnp_Amount: amountVndX100,
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: 'Payment for order order-1',
    vnp_PayDate: '20260709010101',
    vnp_ResponseCode: '00',
    vnp_TmnCode: TMN,
    vnp_TransactionNo: '14000001',
    vnp_TransactionStatus: '00',
    vnp_TxnRef: txnRef,
  });
}

describe('VNPay payment flow (real crypto, in-memory repos)', () => {
  let service: PaymentsService;
  let payments: Payment[];
  let attempts: PaymentAttempt[];
  let seq: number;

  const order = {
    id: 'order-1',
    customerId: 'cust-1',
    status: OrderStatus.PENDING,
    totalVnd: 199000,
    delivery: { id: 'del-1' },
  } as Order;

  beforeAll(() => {
    payments = [];
    attempts = [];
    seq = 0;

    const paymentRepo = {
      findOne: () => Promise.resolve(null),
      create: (v: Partial<Payment>) => ({ ...v }) as Payment,
      save: (v: Payment) => {
        if (!v.id) v.id = `pay-${++seq}`;
        if (!payments.includes(v)) payments.push(v);
        return Promise.resolve(v);
      },
    } as unknown as Repository<Payment>;

    const attemptRepo = {
      findOne: ({
        where,
        relations,
      }: {
        where: { vnpTxnRef: string };
        relations?: { payment?: boolean };
      }) => {
        const a = attempts.find((x) => x.vnpTxnRef === where.vnpTxnRef);
        if (a && relations?.payment) {
          a.payment = payments.find((p) => p.id === a.paymentId) as Payment;
        }
        return Promise.resolve(a ?? null);
      },
      create: (v: Partial<PaymentAttempt>) => ({ ...v }) as PaymentAttempt,
      save: (v: PaymentAttempt) => {
        v.id = `att-${++seq}`;
        attempts.push(v);
        return Promise.resolve(v);
      },
    } as unknown as Repository<PaymentAttempt>;

    const orderRepo = {
      findOne: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === order.id ? order : null),
    } as unknown as Repository<Order>;

    const customerRepo = {
      findOne: () => Promise.resolve({ id: 'cust-1', userId: 'user-1' }),
    } as unknown as Repository<Customer>;

    const dataSource = {
      transaction: (cb: (m: EntityManager) => Promise<unknown>) =>
        cb({
          update: (
            entity: unknown,
            criteria: { id: string; status?: string },
            values: Record<string, unknown>,
          ) => {
            if (entity === PaymentAttempt) {
              const a = attempts.find(
                (x) => x.id === criteria.id && x.status === criteria.status,
              );
              if (!a) return Promise.resolve({ affected: 0 });
              Object.assign(a, values);
              return Promise.resolve({ affected: 1 });
            }
            if (entity === Order) {
              if (
                order.id === criteria.id &&
                order.status === criteria.status
              ) {
                Object.assign(order, values);
                return Promise.resolve({ affected: 1 });
              }
              return Promise.resolve({ affected: 0 });
            }
            const p = payments.find((x) => x.id === criteria.id);
            if (p) Object.assign(p, values);
            return Promise.resolve({ affected: p ? 1 : 0 });
          },
          findOne: (entity: unknown, opts: { where: { id: string } }) => {
            if (entity === Payment) {
              return Promise.resolve(
                payments.find((p) => p.id === opts.where.id) ?? null,
              );
            }
            return Promise.resolve(null);
          },
        } as unknown as EntityManager),
    } as unknown as DataSource;

    const config = {
      paymentConfig: PAYMENT_CONFIG,
      paymentProvider: 'vnpay',
      nodeEnv: 'test',
    } as unknown as AppConfigService;

    const vnpay = new VnpayService({
      tmnCode: TMN,
      secureSecret: SECRET,
      vnpayHost: 'https://sandbox.vnpayment.vn',
      testMode: true,
      hashAlgorithm: HashAlgorithm.SHA512,
      enableLog: false,
      loggerFn: ignoreLogger,
    });

    const stockService = {
      deductByVariantId: () =>
        Promise.resolve({ totalDeducted: 0, batches: [] }),
    };
    const deliveryService = {
      createGhnOrderForPaidOrder: () => Promise.resolve(),
    };

    const walletService = {
      getOrCreateWallet: () => Promise.resolve({ id: 'w-1' }),
      creditWithManager: () => Promise.resolve({ id: 'tx-topup' }),
    };

    const gateway = new VnpayPaymentProvider(vnpay);

    service = new PaymentsService(
      paymentRepo,
      attemptRepo,
      orderRepo,
      customerRepo,
      gateway,
      config,
      dataSource,
      stockService as never,
      deliveryService as never,
      walletService as never,
    );
  });

  it('checkout builds a signed VNPay URL (amount × 100)', async () => {
    const res = await service.checkout(
      'user-1',
      { orderId: 'order-1' },
      '127.0.0.1',
    );
    const url = new URL(res.paymentUrl);
    expect(url.searchParams.get('vnp_SecureHash')).toHaveLength(128);
    expect(url.searchParams.get('vnp_Amount')).toBe('19900000');
    expect(attempts).toHaveLength(1);
  });

  it('return verifies the signature and redirects without mutating status', async () => {
    const ref = attempts[0].vnpTxnRef;
    const { redirectUrl } = await service.handleReturn(
      successCallback(ref, 19900000) as never,
    );
    expect(redirectUrl).toContain('http://localhost:3000/vnpay_return');
    expect(redirectUrl).toContain('paymentId=');
    expect(redirectUrl).toContain('status=success');
    expect(attempts[0].status).toBe('PENDING'); // read-only
  });

  it('a successful IPN marks the attempt SUCCESS, payment PAID, and order PAID', async () => {
    const ref = attempts[0].vnpTxnRef;
    const res = await service.handleIpn(
      successCallback(ref, 19900000) as never,
    );
    expect(res.RspCode).toBe('00');
    expect(attempts[0].status).toBe('SUCCESS');
    expect(payments[0].status).toBe('PAID');
    expect(payments[0].paidAt).toBeInstanceOf(Date);
    expect(order.status).toBe(OrderStatus.PAID);
  });

  it('a duplicate IPN is idempotent (already confirmed, no re-update)', async () => {
    const ref = attempts[0].vnpTxnRef;
    const res = await service.handleIpn(
      successCallback(ref, 19900000) as never,
    );
    expect(res.RspCode).toBe('02');
  });

  it('a tampered IPN is rejected on checksum', async () => {
    const ref = attempts[0].vnpTxnRef;
    const bad = successCallback(ref, 19900000);
    bad.vnp_Amount = '100'; // invalidates the hash
    const res = await service.handleIpn(bad as never);
    expect(res.RspCode).toBe('97');
  });

  it('an IPN whose amount differs from the attempt is rejected', async () => {
    // Fresh PENDING order attempt (same order total) then a validly-signed callback for 50,000.
    order.status = OrderStatus.PENDING;
    await service.checkout('user-1', { orderId: 'order-1' }, '127.0.0.1');
    const ref = attempts[attempts.length - 1].vnpTxnRef;
    const res = await service.handleIpn(successCallback(ref, 5000000) as never);
    expect(res.RspCode).toBe('04');
  });
});

describe('Mock payment flow (in-memory repos)', () => {
  let service: PaymentsService;
  let payments: Payment[];
  let attempts: PaymentAttempt[];
  let seq: number;
  let deductCalls: Array<{
    variantId: string;
    qty: number;
  }>;

  const order = {
    id: 'order-mock-1',
    customerId: 'cust-1',
    status: OrderStatus.PENDING,
    totalVnd: 50000,
    delivery: { id: 'del-1' },
    items: [
      {
        id: 'oi-1',
        productVariantId: 'var-1',
        quantity: 1,
      },
    ],
  } as Order;

  beforeAll(() => {
    payments = [];
    attempts = [];
    seq = 0;
    deductCalls = [];

    const paymentRepo = {
      findOne: ({
        where,
      }: {
        where: { id?: string; orderId?: string; status?: unknown };
      }) => {
        if (where.id) {
          return Promise.resolve(
            payments.find((p) => p.id === where.id) ?? null,
          );
        }
        return Promise.resolve(
          payments.find(
            (p) =>
              p.orderId === where.orderId &&
              (p.status === PaymentStatus.PENDING ||
                p.status === PaymentStatus.PROCESSING),
          ) ?? null,
        );
      },
      create: (v: Partial<Payment>) => ({ ...v }) as Payment,
      save: (v: Payment) => {
        if (!v.id) v.id = `pay-${++seq}`;
        const idx = payments.findIndex((p) => p.id === v.id);
        if (idx >= 0) payments[idx] = v;
        else payments.push(v);
        return Promise.resolve(v);
      },
    } as unknown as Repository<Payment>;

    const attemptRepo = {
      findOne: ({
        where,
        relations,
      }: {
        where: { vnpTxnRef?: string; paymentId?: string };
        relations?: { payment?: boolean };
      }) => {
        const a = attempts.find((x) => {
          if (where.vnpTxnRef && where.paymentId) {
            return (
              x.vnpTxnRef === where.vnpTxnRef && x.paymentId === where.paymentId
            );
          }
          if (where.vnpTxnRef) return x.vnpTxnRef === where.vnpTxnRef;
          return false;
        });
        if (a && relations?.payment) {
          a.payment = payments.find((p) => p.id === a.paymentId) as Payment;
        }
        return Promise.resolve(a ?? null);
      },
      create: (v: Partial<PaymentAttempt>) => ({ ...v }) as PaymentAttempt,
      save: (v: PaymentAttempt) => {
        v.id = `att-${++seq}`;
        attempts.push(v);
        return Promise.resolve(v);
      },
    } as unknown as Repository<PaymentAttempt>;

    const orderRepo = {
      findOne: ({
        where,
        relations,
      }: {
        where: { id: string };
        relations?: string[];
      }) => {
        if (where.id !== order.id) return Promise.resolve(null);
        if (relations?.includes('items')) {
          return Promise.resolve(order);
        }
        return Promise.resolve(order);
      },
    } as unknown as Repository<Order>;

    const customerRepo = {
      findOne: () => Promise.resolve({ id: 'cust-1', userId: 'user-1' }),
    } as unknown as Repository<Customer>;

    const dataSource = {
      transaction: (cb: (m: EntityManager) => Promise<unknown>) =>
        cb({
          update: (
            entity: unknown,
            criteria: { id: string; status?: string },
            values: Record<string, unknown>,
          ) => {
            if (entity === PaymentAttempt) {
              const a = attempts.find(
                (x) => x.id === criteria.id && x.status === criteria.status,
              );
              if (!a) return Promise.resolve({ affected: 0 });
              Object.assign(a, values);
              return Promise.resolve({ affected: 1 });
            }
            if (entity === Order) {
              if (
                order.id === criteria.id &&
                order.status === criteria.status
              ) {
                Object.assign(order, values);
                return Promise.resolve({ affected: 1 });
              }
              return Promise.resolve({ affected: 0 });
            }
            const p = payments.find((x) => x.id === criteria.id);
            if (p) Object.assign(p, values);
            return Promise.resolve({ affected: p ? 1 : 0 });
          },
          findOne: (entity: unknown, opts: { where: { id: string } }) => {
            if (entity === Payment) {
              return Promise.resolve(
                payments.find((p) => p.id === opts.where.id) ?? null,
              );
            }
            return Promise.resolve(null);
          },
        } as unknown as EntityManager),
    } as unknown as DataSource;

    const config = {
      paymentConfig: {
        ...PAYMENT_CONFIG,
        returnUrl: 'http://localhost:3000/payments/vnpay/return',
      },
      paymentProvider: 'mock',
      port: 3000,
      nodeEnv: 'test',
    } as unknown as AppConfigService;

    const gateway = new MockPaymentProvider(config);

    const stockService = {
      deductByVariantId: (variantId: string, qty: number) => {
        deductCalls.push({ variantId, qty });
        return Promise.resolve({ totalDeducted: qty, batches: [] });
      },
    };
    const deliveryService = {
      createGhnOrderForPaidOrder: () => Promise.resolve(),
    };

    const walletService = {
      getOrCreateWallet: () => Promise.resolve({ id: 'w-1' }),
      creditWithManager: () => Promise.resolve({ id: 'tx-topup' }),
    };

    service = new PaymentsService(
      paymentRepo,
      attemptRepo,
      orderRepo,
      customerRepo,
      gateway,
      config,
      dataSource,
      stockService as never,
      deliveryService as never,
      walletService as never,
    );
  });

  it('checkout returns mock complete URL then complete marks PAID and deducts stock', async () => {
    const checkout = await service.checkout(
      'user-1',
      { orderId: 'order-mock-1' },
      '127.0.0.1',
    );
    expect(checkout.paymentUrl).toContain('/payments/mock/complete');
    expect(checkout.paymentUrl).toContain(`paymentId=${checkout.paymentId}`);

    const url = new URL(checkout.paymentUrl);
    const { redirectUrl } = await service.handleMockComplete(
      url.searchParams.get('paymentId')!,
      url.searchParams.get('txnRef')!,
    );

    expect(redirectUrl).toContain('status=success');
    expect(payments[0].status).toBe('PAID');
    expect(order.status).toBe(OrderStatus.PAID);
    expect(deductCalls).toEqual([{ variantId: 'var-1', qty: 1 }]);
  });
});
