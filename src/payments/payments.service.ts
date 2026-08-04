import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  InpOrderAlreadyConfirmed,
  IpnFailChecksum,
  IpnInvalidAmount,
  IpnOrderNotFound,
  IpnSuccess,
  IpnUnknownError,
} from 'vnpay';
import type { IpnResponse } from 'vnpay';
import { AppConfigService } from '../config/config.service';
import { Order } from '../commerce/order.entity';
import { OrderStatus, TransactionType } from '../commerce/enums';
import { DeliveryService } from '../delivery/delivery.service';
import { StockService } from '../stock/stock.service';
import { Customer } from '../users/customer.entity';
import { WalletService } from '../wallet/wallet.service';
import { WalletTopUpDto } from '../wallet/dto/wallet-top-up.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { PaymentStatusDto } from './dto/payment-status.dto';
import { PaymentAttempt } from './payment-attempt.entity';
import { Payment } from './payment.entity';
import {
  PaymentAttemptStatus,
  PaymentClient,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
} from './enums';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  type ProviderVerifyResult,
} from './providers/payment-provider.types';

export type PayosWebhookResponse = {
  code: string;
  desc: string;
};

type FinalizeOutcome =
  | { kind: 'applied'; success: boolean }
  | { kind: 'duplicate' }
  | { kind: 'not_found' }
  | { kind: 'amount_mismatch' };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly deliveryService: DeliveryService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) {}

  /** Create (or reuse) a Payment for a PENDING order and return a gateway payment URL. */
  async checkout(
    userId: string,
    dto: CheckoutDto,
    ipAddr: string,
  ): Promise<CheckoutResponseDto> {
    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }

    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: ['delivery'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.customerId !== customer.id) {
      throw new ForbiddenException('Order does not belong to this customer');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order is not payable (status: ${order.status})`,
      );
    }
    if (!order.delivery) {
      throw new BadRequestException('Order has no shipping selection');
    }

    const clientReturnUrl: string =
      dto.client === PaymentClient.MOBILE
        ? this.config.mobileReturnUrl
        : this.config.clientReturnUrl;

    const amountVnd = String(order.totalVnd);

    let payment = await this.paymentRepo.findOne({
      where: {
        orderId: order.id,
        purpose: PaymentPurpose.ORDER,
        status: In([PaymentStatus.PENDING, PaymentStatus.PROCESSING]),
      },
    });
    if (payment) {
      payment.clientReturnUrl = clientReturnUrl;
      payment.amountVnd = amountVnd;
      payment.provider = this.gateway.code;
      payment.userId = userId;
      payment = await this.paymentRepo.save(payment);
    } else {
      payment = await this.paymentRepo.save(
        this.paymentRepo.create({
          orderId: order.id,
          purpose: PaymentPurpose.ORDER,
          userId,
          provider: this.gateway.code,
          status: PaymentStatus.PENDING,
          amountVnd,
          clientReturnUrl,
        }),
      );
    }

    return this.createAttemptAndCheckoutUrl({
      payment,
      amountVnd,
      ipAddr,
      orderInfo: `Payment for order ${order.id}`,
      gatewayOrderId: order.id,
    });
  }

  /** Create a wallet top-up Payment and return a gateway payment URL. */
  async topUpWallet(
    userId: string,
    dto: WalletTopUpDto,
    ipAddr: string,
  ): Promise<CheckoutResponseDto> {
    await this.walletService.getOrCreateWallet(userId);

    const clientReturnUrl: string =
      dto.client === PaymentClient.MOBILE
        ? this.config.mobileReturnUrl
        : this.config.clientReturnUrl;

    const amountVnd = String(dto.amountVnd);

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        orderId: null,
        purpose: PaymentPurpose.WALLET_TOPUP,
        userId,
        provider: this.gateway.code,
        status: PaymentStatus.PENDING,
        amountVnd,
        clientReturnUrl,
      }),
    );

    return this.createAttemptAndCheckoutUrl({
      payment,
      amountVnd,
      ipAddr,
      orderInfo: `Wallet top-up ${payment.id}`,
      gatewayOrderId: payment.id,
    });
  }

  async handleReturn(
    query: Record<string, unknown>,
  ): Promise<{ redirectUrl: string }> {
    const verify = await this.gateway.verifyReturn(query);

    const attempt = await this.attemptRepo.findOne({
      where: { vnpTxnRef: verify.txnRef },
      relations: { payment: true },
    });

    const base =
      attempt?.payment?.clientReturnUrl ?? this.config.clientReturnUrl;
    const status = !verify.ok
      ? 'invalid'
      : verify.success
        ? 'success'
        : 'failed';

    if (!verify.ok) {
      this.logger.warn(
        `Return signature verification failed for txnRef=${verify.txnRef}`,
      );
    }

    return {
      redirectUrl: this.buildClientRedirect(
        base,
        attempt?.paymentId ?? null,
        status,
      ),
    };
  }

  async handleIpn(query: Record<string, unknown>): Promise<IpnResponse> {
    try {
      const verify = await this.gateway.verifyIpn(query);
      if (!verify.ok) {
        this.logger.warn('IPN checksum verification failed');
        return IpnFailChecksum;
      }

      const outcome = await this.finalizeAttemptFromProviderResult(verify, {
        rawIpn: query,
      });

      if (outcome.kind === 'not_found') {
        this.logger.warn(`IPN for unknown txnRef=${verify.txnRef}`);
        return IpnOrderNotFound;
      }
      if (outcome.kind === 'amount_mismatch') {
        return IpnInvalidAmount;
      }
      if (outcome.kind === 'duplicate') {
        return InpOrderAlreadyConfirmed;
      }

      this.logger.log(
        `IPN processed txnRef=${verify.txnRef} success=${outcome.success} responseCode=${verify.responseCode ?? ''}`,
      );
      return IpnSuccess;
    } catch (error) {
      this.logger.error(
        `IPN processing error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return IpnUnknownError;
    }
  }

  /**
   * PayOS webhook (sole PayOS mutator). Always returns HTTP-friendly JSON;
   * duplicates are acknowledged so PayOS stops retrying.
   */
  async handlePayosWebhook(
    body: Record<string, unknown>,
  ): Promise<PayosWebhookResponse> {
    try {
      const verify = await this.gateway.verifyIpn(body);
      if (!verify.ok) {
        this.logger.warn('PayOS webhook signature verification failed');
        return { code: '01', desc: 'invalid signature' };
      }

      const outcome = await this.finalizeAttemptFromProviderResult(verify, {
        rawIpn: body,
      });

      if (outcome.kind === 'not_found') {
        this.logger.warn(`PayOS webhook for unknown txnRef=${verify.txnRef}`);
        return { code: '01', desc: 'order not found' };
      }
      if (outcome.kind === 'amount_mismatch') {
        return { code: '01', desc: 'invalid amount' };
      }
      if (outcome.kind === 'duplicate') {
        return { code: '00', desc: 'success' };
      }

      this.logger.log(
        `PayOS webhook processed txnRef=${verify.txnRef} success=${outcome.success} responseCode=${verify.responseCode ?? ''}`,
      );
      return { code: '00', desc: 'success' };
    } catch (error) {
      this.logger.error(
        `PayOS webhook processing error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { code: '01', desc: 'unknown error' };
    }
  }

  async handleMockComplete(
    paymentId: string,
    txnRef: string,
  ): Promise<{ redirectUrl: string }> {
    if (this.config.paymentProvider !== 'mock') {
      throw new NotFoundException('Mock payment complete is not enabled');
    }
    if (this.gateway.code !== PaymentProvider.MOCK) {
      throw new NotFoundException('Mock payment complete is not enabled');
    }

    const attempt = await this.attemptRepo.findOne({
      where: { vnpTxnRef: txnRef, paymentId },
      relations: { payment: true },
    });

    const base =
      attempt?.payment?.clientReturnUrl ?? this.config.clientReturnUrl;

    if (!attempt) {
      this.logger.warn(
        `Mock complete for unknown paymentId=${paymentId} txnRef=${txnRef}`,
      );
      return {
        redirectUrl: this.buildClientRedirect(base, paymentId, 'failed'),
      };
    }

    const verify: ProviderVerifyResult = {
      ok: true,
      success: true,
      txnRef,
      amountVnd: attempt.amountVnd,
      responseCode: '00',
      providerTransactionId: `mock-${txnRef}`,
      bankCode: 'MOCK',
      raw: { paymentId, txnRef },
    };

    const outcome = await this.finalizeAttemptFromProviderResult(verify, {
      rawIpn: verify.raw,
    });

    const status =
      outcome.kind === 'applied' && outcome.success
        ? 'success'
        : outcome.kind === 'duplicate'
          ? 'success'
          : 'failed';

    return {
      redirectUrl: this.buildClientRedirect(base, paymentId, status),
    };
  }

  /**
   * Shared idempotent finalize used by VNPay IPN, PayOS webhook, and mock complete.
   * On first successful apply: payment PAID, order PAID, then post-payment side effects.
   */
  private async finalizeAttemptFromProviderResult(
    verify: ProviderVerifyResult,
    options: { rawIpn?: unknown } = {},
  ): Promise<FinalizeOutcome> {
    const attempt = await this.attemptRepo.findOne({
      where: { vnpTxnRef: verify.txnRef },
    });
    if (!attempt) {
      return { kind: 'not_found' };
    }

    if (
      verify.amountVnd != null &&
      Number(verify.amountVnd) !== Number(attempt.amountVnd)
    ) {
      this.logger.warn(
        `Amount mismatch txnRef=${verify.txnRef} expected=${attempt.amountVnd} got=${verify.amountVnd}`,
      );
      return { kind: 'amount_mismatch' };
    }

    const success = verify.success;
    const now = new Date();

    let paidOrderPaymentId: string | null = null;

    const applied = await this.dataSource.transaction(async (manager) => {
      const updated = await manager.update(
        PaymentAttempt,
        { id: attempt.id, status: PaymentAttemptStatus.PENDING },
        {
          status: success
            ? PaymentAttemptStatus.SUCCESS
            : PaymentAttemptStatus.FAILED,
          responseCode: verify.responseCode ?? null,
          providerTransactionId: verify.providerTransactionId ?? null,
          bankCode: verify.bankCode ?? null,
          paidAt: success ? now : null,
          ...(options.rawIpn != null
            ? { rawIpn: options.rawIpn as Record<string, unknown> }
            : {}),
        },
      );

      if (!updated.affected) {
        this.logger.log(
          `Finalize duplicate for txnRef=${verify.txnRef} — already confirmed`,
        );
        return false;
      }

      await manager.update(
        Payment,
        { id: attempt.paymentId },
        {
          status: success ? PaymentStatus.PAID : PaymentStatus.FAILED,
          paidAt: success ? now : null,
        },
      );

      if (success) {
        const payment = await manager.findOne(Payment, {
          where: { id: attempt.paymentId },
        });
        if (!payment) {
          return true;
        }

        if (payment.purpose === PaymentPurpose.WALLET_TOPUP && payment.userId) {
          await this.walletService.creditWithManager(manager, {
            type: TransactionType.WALLET_TOPUP,
            amountVnd: payment.amountVnd,
            userId: payment.userId,
            note: `Wallet top-up payment ${payment.id}`,
            externalRef: payment.id,
          });
        } else if (
          payment.purpose === PaymentPurpose.ORDER &&
          payment.orderId
        ) {
          await manager.update(
            Order,
            { id: payment.orderId, status: OrderStatus.PENDING },
            { status: OrderStatus.PAID },
          );
          paidOrderPaymentId = payment.id;
        }
      }

      return true;
    });

    if (!applied) {
      return { kind: 'duplicate' };
    }

    if (success && paidOrderPaymentId) {
      await this.runPostPaymentSideEffects(paidOrderPaymentId);
    }

    return { kind: 'applied', success };
  }

  /**
   * Stock deduction + GHN handover, each isolated so one failing cannot skip the other
   * or reach the finalize/IPN catch. Collaborators are expected to handle their own errors;
   * this is defence in depth, not a substitute for that.
   */
  private async runPostPaymentSideEffects(paymentId: string): Promise<void> {
    await this.safely('stock deduction', paymentId, () =>
      this.deductStockForPaidPayment(paymentId),
    );
    await this.safely('GHN delivery creation', paymentId, () =>
      this.createDeliveryForPaidPayment(paymentId),
    );
  }

  private async safely(
    label: string,
    paymentId: string,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `${label} failed for payment=${paymentId} (payment is still confirmed): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Hands the paid order to GHN. Runs after the IPN's idempotency gate, so at most once. */
  private async createDeliveryForPaidPayment(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment?.orderId) {
      return;
    }
    await this.deliveryService.createGhnOrderForPaidOrder(payment.orderId);
  }

  private async deductStockForPaidPayment(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment?.orderId) {
      return;
    }

    const order = await this.orderRepo.findOne({
      where: { id: payment.orderId },
      relations: ['items'],
    });
    if (!order?.items?.length) {
      return;
    }

    for (const item of order.items) {
      try {
        await this.stockService.deductByVariantId(
          item.productVariantId,
          item.quantity,
          `Order ${order.id} payment ${payment.id}`,
          item.id,
        );
      } catch (error) {
        this.logger.error(
          `Stock deduction failed for orderItem=${item.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async getStatus(
    userId: string,
    paymentId: string,
  ): Promise<PaymentStatusDto> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: { order: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.purpose === PaymentPurpose.WALLET_TOPUP) {
      if (payment.userId !== userId) {
        throw new ForbiddenException(
          'Payment does not belong to this customer',
        );
      }
    } else {
      const customer = await this.customerRepo.findOne({ where: { userId } });
      if (!customer || payment.order?.customerId !== customer.id) {
        throw new ForbiddenException(
          'Payment does not belong to this customer',
        );
      }
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      purpose: payment.purpose,
      status: payment.status,
      provider: payment.provider,
      amountVnd: payment.amountVnd,
      paidAt: payment.paidAt,
    };
  }

  private async createAttemptAndCheckoutUrl(params: {
    payment: Payment;
    amountVnd: string;
    ipAddr: string;
    orderInfo: string;
    gatewayOrderId: string;
  }): Promise<CheckoutResponseDto> {
    const { payment, amountVnd, ipAddr, orderInfo, gatewayOrderId } = params;
    const txnRef = this.gateway.createTxnRef();
    await this.attemptRepo.save(
      this.attemptRepo.create({
        paymentId: payment.id,
        vnpTxnRef: txnRef,
        status: PaymentAttemptStatus.PENDING,
        amountVnd,
      }),
    );

    const isPayos = this.gateway.code === PaymentProvider.PAYOS;
    const returnUrl = isPayos
      ? this.config.payosConfig.returnUrl
      : this.config.paymentConfig.returnUrl;
    const cancelUrl = isPayos ? this.config.payosConfig.cancelUrl : undefined;

    const { paymentUrl } = await this.gateway.createCheckout({
      amountVnd,
      txnRef,
      orderId: gatewayOrderId,
      orderInfo,
      ipAddr,
      returnUrl,
      cancelUrl,
      paymentId: payment.id,
    });

    this.logger.log(
      `Checkout created payment=${payment.id} purpose=${payment.purpose} provider=${this.gateway.code} txnRef=${txnRef} amount=${amountVnd}`,
    );

    return { paymentId: payment.id, paymentUrl };
  }

  private buildClientRedirect(
    base: string,
    paymentId: string | null,
    status: string,
  ): string {
    try {
      const url = new URL(base);
      if (paymentId) {
        url.searchParams.set('paymentId', paymentId);
      }
      url.searchParams.set('status', status);
      return url.toString();
    } catch {
      const sep = base.includes('?') ? '&' : '?';
      const parts = [
        paymentId ? `paymentId=${encodeURIComponent(paymentId)}` : '',
        `status=${status}`,
      ]
        .filter(Boolean)
        .join('&');
      return `${base}${sep}${parts}`;
    }
  }
}
