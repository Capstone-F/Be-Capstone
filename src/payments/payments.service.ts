import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { VnpayService } from 'nestjs-vnpay';
import {
  InpOrderAlreadyConfirmed,
  IpnFailChecksum,
  IpnInvalidAmount,
  IpnOrderNotFound,
  IpnSuccess,
  IpnUnknownError,
  ProductCode,
  VnpLocale,
} from 'vnpay';
import type { IpnResponse, ReturnQueryFromVNPay } from 'vnpay';
import { AppConfigService } from '../config/config.service';
import { Order } from '../commerce/order.entity';
import { OrderStatus } from '../commerce/enums';
import { Customer } from '../users/customer.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { PaymentStatusDto } from './dto/payment-status.dto';
import { PaymentAttempt } from './payment-attempt.entity';
import { Payment } from './payment.entity';
import {
  PaymentAttemptStatus,
  PaymentClient,
  PaymentProvider,
  PaymentStatus,
} from './enums';

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
    private readonly vnpay: VnpayService,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /** Create (or reuse) a Payment for a PENDING order and return a VNPay payment URL. */
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

    const { paymentConfig } = this.config;
    const clientReturnUrl: string =
      dto.client === PaymentClient.MOBILE
        ? paymentConfig.mobileReturnUrl
        : paymentConfig.clientReturnUrl;

    const amountVnd = String(order.totalVnd);

    // Reuse an in-flight payment for this order; otherwise open a new one.
    let payment = await this.paymentRepo.findOne({
      where: {
        orderId: order.id,
        status: In([PaymentStatus.PENDING, PaymentStatus.PROCESSING]),
      },
    });
    if (payment) {
      payment.clientReturnUrl = clientReturnUrl;
      payment.amountVnd = amountVnd;
      payment = await this.paymentRepo.save(payment);
    } else {
      payment = await this.paymentRepo.save(
        this.paymentRepo.create({
          orderId: order.id,
          provider: PaymentProvider.VNPAY,
          status: PaymentStatus.PENDING,
          amountVnd,
          clientReturnUrl,
        }),
      );
    }

    const vnpTxnRef = randomUUID().replace(/-/g, '');
    await this.attemptRepo.save(
      this.attemptRepo.create({
        paymentId: payment.id,
        vnpTxnRef,
        status: PaymentAttemptStatus.PENDING,
        amountVnd,
      }),
    );

    const paymentUrl = this.vnpay.buildPaymentUrl({
      vnp_Amount: Number(amountVnd),
      vnp_IpAddr: ipAddr,
      vnp_TxnRef: vnpTxnRef,
      vnp_OrderInfo: `Payment for order ${order.id}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: paymentConfig.returnUrl,
      vnp_Locale: VnpLocale.VN,
    });

    this.logger.log(
      `Checkout created payment=${payment.id} order=${order.id} txnRef=${vnpTxnRef} amount=${amountVnd}`,
    );

    return { paymentId: payment.id, paymentUrl };
  }

  /**
   * Handle the browser return from VNPay. Verifies the signature and returns the
   * client landing URL to 302 to. READ-ONLY — never mutates payment state.
   */
  async handleReturn(
    query: ReturnQueryFromVNPay,
  ): Promise<{ redirectUrl: string }> {
    const verify = await this.vnpay.verifyReturnUrl(query);

    const attempt = await this.attemptRepo.findOne({
      where: { vnpTxnRef: String(verify.vnp_TxnRef) },
      relations: { payment: true },
    });

    // Only ever redirect to a stored/allowlisted target — never a value from the query.
    const base =
      attempt?.payment?.clientReturnUrl ??
      this.config.paymentConfig.clientReturnUrl;
    const status = !verify.isVerified
      ? 'invalid'
      : verify.isSuccess
        ? 'success'
        : 'failed';

    if (!verify.isVerified) {
      this.logger.warn(
        `Return signature verification failed for txnRef=${String(verify.vnp_TxnRef)}`,
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

  /**
   * Handle the server-to-server IPN from VNPay. Verifies signature + amount and
   * updates attempt/payment status idempotently. Returns VNPay's RspCode response.
   */
  async handleIpn(query: ReturnQueryFromVNPay): Promise<IpnResponse> {
    try {
      const verify = await this.vnpay.verifyIpnCall(query);
      if (!verify.isVerified) {
        this.logger.warn('IPN checksum verification failed');
        return IpnFailChecksum;
      }

      const txnRef = String(verify.vnp_TxnRef);
      const attempt = await this.attemptRepo.findOne({
        where: { vnpTxnRef: txnRef },
      });
      if (!attempt) {
        this.logger.warn(`IPN for unknown txnRef=${txnRef}`);
        return IpnOrderNotFound;
      }

      if (Number(verify.vnp_Amount) !== Number(attempt.amountVnd)) {
        this.logger.warn(
          `IPN amount mismatch txnRef=${txnRef} expected=${attempt.amountVnd} got=${String(verify.vnp_Amount)}`,
        );
        return IpnInvalidAmount;
      }

      const success = verify.isSuccess;
      const now = new Date();

      return await this.dataSource.transaction(async (manager) => {
        // Conditional update — only the PENDING → terminal transition wins,
        // so a duplicate/concurrent IPN affects 0 rows and is reported as already-confirmed.
        const updated = await manager.update(
          PaymentAttempt,
          { id: attempt.id, status: PaymentAttemptStatus.PENDING },
          {
            status: success
              ? PaymentAttemptStatus.SUCCESS
              : PaymentAttemptStatus.FAILED,
            responseCode: String(verify.vnp_ResponseCode),
            providerTransactionId:
              verify.vnp_TransactionNo != null
                ? String(verify.vnp_TransactionNo)
                : null,
            bankCode: verify.vnp_BankCode ?? null,
            paidAt: success ? now : null,
            rawIpn: query,
          },
        );

        if (!updated.affected) {
          this.logger.log(
            `IPN duplicate for txnRef=${txnRef} — already confirmed`,
          );
          return InpOrderAlreadyConfirmed;
        }

        await manager.update(
          Payment,
          { id: attempt.paymentId },
          {
            status: success ? PaymentStatus.PAID : PaymentStatus.FAILED,
            paidAt: success ? now : null,
          },
        );

        this.logger.log(
          `IPN processed txnRef=${txnRef} success=${success} responseCode=${String(verify.vnp_ResponseCode)}`,
        );
        return IpnSuccess;
      });
    } catch (error) {
      this.logger.error(
        `IPN processing error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return IpnUnknownError;
    }
  }

  /** Authoritative, IPN-confirmed payment status for the owning customer. */
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

    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer || payment.order.customerId !== customer.id) {
      throw new ForbiddenException('Payment does not belong to this customer');
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      provider: payment.provider,
      amountVnd: payment.amountVnd,
      paidAt: payment.paidAt,
    };
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
