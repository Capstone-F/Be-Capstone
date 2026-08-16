import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VnpayModule } from 'nestjs-vnpay';
import { HashAlgorithm, ignoreLogger } from 'vnpay';
import { AppConfigService } from '../config/config.service';
import { Order } from '../commerce/order.entity';
import { OrderItem } from '../commerce/order-item.entity';
import { Transaction } from '../commerce/transaction.entity';
import { Customer } from '../users/customer.entity';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { DeliveryModule } from '../delivery/delivery.module';
import { StockModule } from '../stock/stock.module';
import { WalletModule } from '../wallet/wallet.module';
import { Payment } from './payment.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock.payment-provider';
import { PayosPaymentProvider } from './providers/payos.payment-provider';
import { PAYMENT_GATEWAY } from './providers/payment-provider.types';
import { VnpayPaymentProvider } from './providers/vnpay.payment-provider';
import { CommerceAnalyticsModule } from '../analytics/commerce-analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentAttempt,
      Order,
      OrderItem,
      Customer,
      Transaction,
    ]),
    AuthModule,
    StockModule,
    DeliveryModule,
    forwardRef(() => WalletModule),
    CommerceAnalyticsModule,
    VnpayModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const p = config.paymentConfig;
        return {
          tmnCode: p.tmnCode,
          secureSecret: p.hashSecret,
          vnpayHost: p.vnpayHost,
          testMode: config.nodeEnv !== 'production',
          hashAlgorithm: HashAlgorithm.SHA512,
          enableLog: config.nodeEnv !== 'production',
          loggerFn: ignoreLogger,
        };
      },
    }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    SessionGuard,
    MockPaymentProvider,
    VnpayPaymentProvider,
    PayosPaymentProvider,
    {
      provide: PAYMENT_GATEWAY,
      inject: [
        AppConfigService,
        MockPaymentProvider,
        VnpayPaymentProvider,
        PayosPaymentProvider,
      ],
      useFactory: (
        config: AppConfigService,
        mock: MockPaymentProvider,
        vnpay: VnpayPaymentProvider,
        payos: PayosPaymentProvider,
      ) => {
        switch (config.paymentProvider) {
          case 'mock':
            return mock;
          case 'payos':
            return payos;
          case 'vnpay':
          default:
            return vnpay;
        }
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
