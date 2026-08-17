import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Transaction } from '../commerce/transaction.entity';
import { CSV_EXPORT_CAP, csvDocument, csvEscape } from './csv.util';
import {
  AdminTransactionResponseDto,
  PaginatedAdminTransactionsDto,
} from './dto/admin-transaction-response.dto';
import { ListAdminTransactionsQueryDto } from './dto/list-finance-query.dto';

/**
 * Date-only filters (YYYY-MM-DD) are interpreted as calendar days in
 * Asia/Ho_Chi_Minh (UTC+7, no DST): `from` starts at 00:00:00.000 and
 * `to` ends at 23:59:59.999 local time.
 */
export function vnDayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000+07:00`);
}

export function vnDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999+07:00`);
}

@Injectable()
export class AdminTransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  /**
   * Platform-wide ledger: same statement as the clinic view but without the
   * single-clinic scope, plus partner/customer filters and joined names.
   */
  async list(
    query: ListAdminTransactionsQueryDto,
  ): Promise<PaginatedAdminTransactionsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.buildQuery(query)
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((t) => this.toDto(t)),
      total,
      page,
      limit,
    };
  }

  /**
   * CSV of the platform ledger for the given filters (no pagination; capped
   * at {@link CSV_EXPORT_CAP} rows, oldest first for a readable statement).
   */
  async exportCsv(query: ListAdminTransactionsQueryDto): Promise<string> {
    const rows = await this.buildQuery(query)
      .orderBy('t.createdAt', 'ASC')
      .take(CSV_EXPORT_CAP)
      .getMany();

    const header = [
      'Date',
      'Type',
      'Status',
      'Amount (VND)',
      'From',
      'To',
      'Clinic ID',
      'Clinic Name',
      'User ID',
      'User Name',
      'Expert ID',
      'Order ID',
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
          t.clinicId ?? '',
          t.clinic?.name ?? '',
          t.userId ?? '',
          t.user?.name ?? t.user?.email ?? '',
          t.expertId ?? '',
          t.orderId ?? '',
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

  private buildQuery(
    query: ListAdminTransactionsQueryDto,
  ): SelectQueryBuilder<Transaction> {
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.clinic', 'clinic')
      .leftJoinAndSelect('t.user', 'user');

    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.clinicId) {
      qb.andWhere('t.clinicId = :clinicId', { clinicId: query.clinicId });
    }
    if (query.userId) {
      qb.andWhere('t.userId = :userId', { userId: query.userId });
    }
    if (query.expertId) {
      qb.andWhere('t.expertId = :expertId', { expertId: query.expertId });
    }
    if (query.orderId) {
      qb.andWhere('t.orderId = :orderId', { orderId: query.orderId });
    }
    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.note) LIKE :searchPattern OR LOWER(t.externalRef) LIKE :searchPattern OR LOWER(CAST(t.id AS varchar)) LIKE :searchPattern)',
        { searchPattern },
      );
    }
    if (query.from) {
      qb.andWhere('t.createdAt >= :from', { from: vnDayStart(query.from) });
    }
    if (query.to) {
      qb.andWhere('t.createdAt <= :to', { to: vnDayEnd(query.to) });
    }
    if (query.minAmountVnd != null) {
      qb.andWhere('t.amountVnd >= :minAmountVnd', {
        minAmountVnd: query.minAmountVnd,
      });
    }
    if (query.maxAmountVnd != null) {
      qb.andWhere('t.amountVnd <= :maxAmountVnd', {
        maxAmountVnd: query.maxAmountVnd,
      });
    }

    return qb;
  }

  private toDto(t: Transaction): AdminTransactionResponseDto {
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      amountVnd: t.amountVnd,
      fromAccount: t.fromAccount,
      toAccount: t.toAccount,
      clinicId: t.clinicId,
      clinicName: t.clinic?.name ?? null,
      userId: t.userId,
      userName: t.user?.name ?? t.user?.email ?? null,
      orderId: t.orderId,
      consultationId: t.consultationId,
      treatmentId: t.treatmentId,
      treatmentPhaseId: t.treatmentPhaseId,
      escrowHoldId: t.escrowHoldId,
      withdrawalId: t.withdrawalId,
      expertId: t.expertId,
      externalRef: t.externalRef,
      note: t.note,
      createdAt: t.createdAt,
    };
  }
}
