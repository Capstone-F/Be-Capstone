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
import { CSV_EXPORT_CAP, csvDocument, csvEscape } from './csv.util';

export type ClinicStatementQuery = {
  search?: string;
  q?: string;
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
    const searchTerm = query.search?.trim() || query.q?.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.note) LIKE :searchPattern OR LOWER(t.id) LIKE :searchPattern OR LOWER(t.externalRef) LIKE :searchPattern)',
        { searchPattern },
      );
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

  /**
   * Build a CSV of the clinic ledger for the given filters (no pagination;
   * capped at {@link CSV_EXPORT_CAP} rows, oldest first for a readable statement).
   */
  async exportTransactionsCsv(
    clinicId: string,
    query: ClinicStatementQuery,
  ): Promise<string> {
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .where('t.clinicId = :clinicId', { clinicId })
      .orderBy('t.createdAt', 'ASC')
      .take(CSV_EXPORT_CAP);

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

    const rows = await qb.getMany();

    const header = [
      'Date',
      'Type',
      'Status',
      'Amount (VND)',
      'From',
      'To',
      'Expert ID',
      'Consultation ID',
      'Treatment ID',
      'Treatment Phase ID',
      'Withdrawal ID',
      'External Ref',
      'Note',
    ];

    const lines = [header.map(csvEscape).join(',')];
    for (const t of rows) {
      lines.push(
        [
          t.createdAt.toISOString(),
          t.type,
          t.status,
          t.amountVnd,
          t.fromAccount ?? '',
          t.toAccount ?? '',
          t.expertId ?? '',
          t.consultationId ?? '',
          t.treatmentId ?? '',
          t.treatmentPhaseId ?? '',
          t.withdrawalId ?? '',
          t.externalRef ?? '',
          t.note ?? '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }

    return csvDocument(lines);
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
