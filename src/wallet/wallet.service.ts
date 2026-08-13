import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  TransactionStatus,
  TransactionType,
  LedgerAccount,
} from '../commerce/enums';
import { Transaction } from '../commerce/transaction.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../users/wallet.entity';
import { AdminWalletTopUpResponseDto } from './dto/admin-wallet-top-up-response.dto';
import { WalletBalanceDto } from './dto/wallet-balance.dto';

export type WalletDebitOptions = {
  type: TransactionType;
  amountVnd: number | string;
  userId: string;
  consultationId?: string | null;
  treatmentId?: string | null;
  treatmentPhaseId?: string | null;
  orderId?: string | null;
  clinicId?: string | null;
  expertId?: string | null;
  escrowHoldId?: string | null;
  withdrawalId?: string | null;
  fromAccount?: LedgerAccount | null;
  toAccount?: LedgerAccount | null;
  note?: string | null;
  externalRef?: string | null;
};

export type WalletCreditOptions = {
  type: TransactionType;
  amountVnd: number | string;
  userId: string;
  consultationId?: string | null;
  treatmentId?: string | null;
  treatmentPhaseId?: string | null;
  orderId?: string | null;
  clinicId?: string | null;
  expertId?: string | null;
  escrowHoldId?: string | null;
  withdrawalId?: string | null;
  fromAccount?: LedgerAccount | null;
  toAccount?: LedgerAccount | null;
  note?: string | null;
  externalRef?: string | null;
};

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { userId } });
    if (wallet) {
      return wallet;
    }
    wallet = this.walletRepo.create({
      userId,
      balanceVnd: '0',
      isActive: true,
    });
    return this.walletRepo.save(wallet);
  }

  async getBalance(userId: string): Promise<WalletBalanceDto> {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceVnd: wallet.balanceVnd,
      isActive: wallet.isActive,
    };
  }

  /** Admin/support: resolve user first, then return (or create) wallet balance. */
  async getBalanceForUser(userId: string): Promise<WalletBalanceDto> {
    await this.requireUser(userId);
    return this.getBalance(userId);
  }

  /**
   * Admin/support direct credit — does not use payment gateway.
   * Ledger type remains WALLET_TOPUP with an admin note.
   */
  async adminTopUp(
    userId: string,
    amountVnd: number,
    note?: string,
  ): Promise<AdminWalletTopUpResponseDto> {
    await this.requireUser(userId);

    const creditNote = note?.trim() || `Admin wallet credit for user ${userId}`;

    const tx = await this.credit({
      type: TransactionType.WALLET_TOPUP,
      amountVnd,
      userId,
      note: creditNote,
      externalRef: `admin-topup:${userId}:${Date.now()}`,
      fromAccount: LedgerAccount.EXTERNAL_GATEWAY,
      toAccount: LedgerAccount.CUSTOMER_WALLET,
    });

    const wallet = await this.getOrCreateWallet(userId);
    return {
      walletId: wallet.id,
      userId,
      balanceVnd: wallet.balanceVnd,
      transactionId: tx.id,
      amountVnd: String(amountVnd),
      note: creditNote,
    };
  }

  async debit(options: WalletDebitOptions): Promise<Transaction> {
    return this.dataSource.transaction((manager) =>
      this.debitWithManager(manager, options),
    );
  }

  async credit(options: WalletCreditOptions): Promise<Transaction> {
    return this.dataSource.transaction((manager) =>
      this.creditWithManager(manager, options),
    );
  }

  async debitWithManager(
    manager: EntityManager,
    options: WalletDebitOptions,
  ): Promise<Transaction> {
    const amount = this.parsePositiveAmount(options.amountVnd);
    const wallet = await this.lockWallet(manager, options.userId);
    this.assertWalletActive(wallet);

    const balance = BigInt(wallet.balanceVnd);
    if (balance < BigInt(amount)) {
      throw new BadRequestException('Số dư ví không đủ');
    }

    wallet.balanceVnd = String(balance - BigInt(amount));
    await manager.save(Wallet, wallet);

    const tx = manager.create(Transaction, {
      type: options.type,
      status: TransactionStatus.COMPLETED,
      amountVnd: String(amount),
      userId: options.userId,
      consultationId: options.consultationId ?? null,
      treatmentId: options.treatmentId ?? null,
      treatmentPhaseId: options.treatmentPhaseId ?? null,
      orderId: options.orderId ?? null,
      clinicId: options.clinicId ?? null,
      expertId: options.expertId ?? null,
      escrowHoldId: options.escrowHoldId ?? null,
      withdrawalId: options.withdrawalId ?? null,
      fromAccount: options.fromAccount ?? null,
      toAccount: options.toAccount ?? null,
      note: options.note ?? null,
      externalRef: options.externalRef ?? null,
    });
    return manager.save(Transaction, tx);
  }

  async creditWithManager(
    manager: EntityManager,
    options: WalletCreditOptions,
  ): Promise<Transaction> {
    const amount = this.parsePositiveAmount(options.amountVnd);
    const wallet = await this.lockWallet(manager, options.userId);
    this.assertWalletActive(wallet);

    wallet.balanceVnd = String(BigInt(wallet.balanceVnd) + BigInt(amount));
    await manager.save(Wallet, wallet);

    const tx = manager.create(Transaction, {
      type: options.type,
      status: TransactionStatus.COMPLETED,
      amountVnd: String(amount),
      userId: options.userId,
      consultationId: options.consultationId ?? null,
      treatmentId: options.treatmentId ?? null,
      treatmentPhaseId: options.treatmentPhaseId ?? null,
      orderId: options.orderId ?? null,
      clinicId: options.clinicId ?? null,
      expertId: options.expertId ?? null,
      escrowHoldId: options.escrowHoldId ?? null,
      withdrawalId: options.withdrawalId ?? null,
      fromAccount: options.fromAccount ?? null,
      toAccount: options.toAccount ?? null,
      note: options.note ?? null,
      externalRef: options.externalRef ?? null,
    });
    return manager.save(Transaction, tx);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng ${userId}`);
    }
    return user;
  }

  private async lockWallet(
    manager: EntityManager,
    userId: string,
  ): Promise<Wallet> {
    let wallet = await manager
      .getRepository(Wallet)
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.userId = :userId', { userId })
      .getOne();

    if (!wallet) {
      wallet = manager.create(Wallet, {
        userId,
        balanceVnd: '0',
        isActive: true,
      });
      wallet = await manager.save(Wallet, wallet);
      wallet = await manager
        .getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id: wallet.id })
        .getOne();
    }

    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví');
    }
    return wallet;
  }

  private assertWalletActive(wallet: Wallet): void {
    if (!wallet.isActive) {
      throw new BadRequestException('Ví không hoạt động');
    }
  }

  private parsePositiveAmount(value: number | string): number {
    const amount = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền phải là số nguyên dương VND');
    }
    return amount;
  }
}
