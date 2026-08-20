import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Clinic } from '../clinics/clinic.entity';
import { ClinicsModule } from '../clinics/clinics.module';
import { Transaction } from '../commerce/transaction.entity';
import { WalletModule } from '../wallet/wallet.module';
import { AdminClinicWithdrawalsController } from './admin-clinic-withdrawals.controller';
import { AdminTransactionsController } from './admin-transactions.controller';
import { AdminTransactionsService } from './admin-transactions.service';
import { ClinicFinanceController } from './clinic-finance.controller';
import { ClinicStatementService } from './clinic-statement.service';
import { ClinicWallet } from './clinic-wallet.entity';
import { ClinicWalletService } from './clinic-wallet.service';
import { ClinicWithdrawal } from './clinic-withdrawal.entity';
import { ClinicWithdrawalsService } from './clinic-withdrawals.service';
import { EscrowHold } from './escrow-hold.entity';
import { EscrowService } from './escrow.service';
import { LedgerService } from './ledger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClinicWallet,
      EscrowHold,
      ClinicWithdrawal,
      Transaction,
      Clinic,
    ]),
    AuthModule,
    WalletModule,
    forwardRef(() => ClinicsModule),
  ],
  controllers: [
    ClinicFinanceController,
    AdminClinicWithdrawalsController,
    AdminTransactionsController,
  ],
  providers: [
    LedgerService,
    ClinicWalletService,
    EscrowService,
    ClinicWithdrawalsService,
    ClinicStatementService,
    AdminTransactionsService,
    SessionGuard,
    RolesGuard,
  ],
  exports: [
    LedgerService,
    ClinicWalletService,
    EscrowService,
    ClinicWithdrawalsService,
    ClinicStatementService,
    AdminTransactionsService,
  ],
})
export class FinanceModule {}
