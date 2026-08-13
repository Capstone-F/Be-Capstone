import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionType } from '../commerce/enums';
import { Transaction } from '../commerce/transaction.entity';
import {
  ClinicTransactionResponseDto,
  PaginatedClinicTransactionsDto,
} from './dto/clinic-transaction-response.dto';
import { ClinicWalletService } from './clinic-wallet.service';
import { ClinicWithdrawalsService } from './clinic-withdrawals.service';
import { ClinicWithdrawalStatus } from './enums';
import { EscrowService } from './escrow.service';
import { ClinicWalletSummaryDto } from './dto/clinic-wallet-summary.dto';
import { Clinic } from '../clinics/clinic.entity';

export type ClinicStatementQuery = {
  type?: TransactionType;
  expertId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ClinicStatementService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Clinic)
    private readonly clinicRepo: Repository<Clinic>,
    private readonly clinicWalletService: ClinicWalletService,
    private readonly escrowService: EscrowService,
    private readonly withdrawalsService: ClinicWithdrawalsService,
  ) {}

  async getWalletSummary(clinicId: string): Promise<ClinicWalletSummaryDto> {
    const clinic = await this.clinicRepo.findOne({ where: { id: clinicId } });
    const wallet = await this.clinicWalletService.getBalance(clinicId);
    const heldEscrowVnd = await this.escrowService.sumHeldForClinic(clinicId);

    const pending = await this.withdrawalsService.listAdmin({
      clinicId,
      status: ClinicWithdrawalStatus.REQUESTED,
      page: 1,
      limit: 100,
    });
    const pendingWithdrawalsVnd = pending.items
      .reduce((sum, w) => sum + BigInt(w.amountVnd), 0n)
      .toString();

    return {
      clinicId,
      balanceVnd: wallet.balanceVnd,
      heldEscrowVnd,
      pendingWithdrawalsVnd,
      isActive: wallet.isActive,
      bankName: clinic?.bankName ?? null,
      bankAccountNumber: clinic?.bankAccountNumber ?? null,
      bankAccountHolder: clinic?.bankAccountHolder ?? null,
    };
  }

  async listTransactions(
    clinicId: string,
    query: ClinicStatementQuery,
  ): Promise<PaginatedClinicTransactionsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .where('t.clinicId = :clinicId', { clinicId })
      .orderBy('t.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    if (query.expertId) {
      qb.andWhere('t.expertId = :expertId', { expertId: query.expertId });
    }
    if (query.from) {
      qb.andWhere('t.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('t.createdAt <= :to', { to: new Date(query.to) });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((t) => this.toDto(t)),
      total,
      page,
      limit,
    };
  }

  private toDto(t: Transaction): ClinicTransactionResponseDto {
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      amountVnd: t.amountVnd,
      fromAccount: t.fromAccount,
      toAccount: t.toAccount,
      clinicId: t.clinicId,
      expertId: t.expertId,
      userId: t.userId,
      consultationId: t.consultationId,
      treatmentId: t.treatmentId,
      treatmentPhaseId: t.treatmentPhaseId,
      escrowHoldId: t.escrowHoldId,
      withdrawalId: t.withdrawalId,
      externalRef: t.externalRef,
      note: t.note,
      createdAt: t.createdAt,
    };
  }
}
