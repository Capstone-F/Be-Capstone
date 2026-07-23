import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VnpayModule } from 'nestjs-vnpay';
import { HashAlgorithm, ignoreLogger } from 'vnpay';
import { AppConfigService } from '../config/config.service';
import { Order } from '../commerce/order.entity';
import { Customer } from '../users/customer.entity';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { StockModule } from '../stock/stock.module';
import { Payment } from './payment.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock.payment-provider';
import { PAYMENT_GATEWAY } from './providers/payment-provider.types';
import { VnpayPaymentProvider } from './providers/vnpay.payment-provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentAttempt, Order, Customer]),
    AuthModule,
    StockModule,
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
    {
      provide: PAYMENT_GATEWAY,
      inject: [AppConfigService, MockPaymentProvider, VnpayPaymentProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockPaymentProvider,
        vnpay: VnpayPaymentProvider,
      ) => {
        switch (config.paymentProvider) {
          case 'mock':
            return mock;
          case 'vnpay':
          default:
            return vnpay;
        }
      },
    },
  ],
})
export class PaymentsModule {}
