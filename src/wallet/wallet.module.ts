import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Transaction } from '../commerce/transaction.entity';
import { PaymentsModule } from '../payments/payments.module';
import { User } from '../users/user.entity';
import { Wallet } from '../users/wallet.entity';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, User]),
    AuthModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService, SessionGuard, RolesGuard],
  exports: [WalletService],
})
export class WalletModule {}
