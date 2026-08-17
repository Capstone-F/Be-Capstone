import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AdminClinicBalanceDto,
  PaginatedAdminClinicBalancesDto,
} from './dto/admin-clinic-balance-response.dto';
import { ListAdminClinicBalancesQueryDto } from './dto/list-finance-query.dto';

type BalanceRow = {
  clinic_id: string;
  clinic_name: string;
  balance_vnd: string | null;
  held_escrow_vnd: string | null;
  pending_withdrawals_vnd: string | null;
  commission_earned_vnd: string | null;
  last_payout_at: string | Date | null;
};

/** Integer VND amounts leave Postgres as numeric/bigint strings; keep them strings. */
function asAmountString(value: string | null): string {
  return value == null ? '0' : String(value);
}

@Injectable()
export class AdminClinicBalancesService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Per-clinic money position: available balance, held escrow, withdrawals
   * awaiting review, commission collected from the clinic, and last payout.
   * Matches GET /clinic/wallet for the same clinic by construction (same
   * source tables and status filters).
   */
  async list(
    query: ListAdminClinicBalancesQueryDto,
  ): Promise<PaginatedAdminClinicBalancesDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.clinicId) {
      params.push(query.clinicId);
      conditions.push(`c.id = $${params.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c.name ILIKE $${params.length}`);
    }
    const whereSql = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countRows = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM clinics c ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const itemParams = [...params, limit, (page - 1) * limit];
    const rows = await this.dataSource.query<BalanceRow[]>(
      `
      SELECT
        c.id AS clinic_id,
        c.name AS clinic_name,
        w."balanceVnd" AS balance_vnd,
        held.total AS held_escrow_vnd,
        pending.total AS pending_withdrawals_vnd,
        commission.total AS commission_earned_vnd,
        payout.last_payout_at
      FROM clinics c
      LEFT JOIN clinic_wallets w ON w."clinicId" = c.id
      LEFT JOIN (
        SELECT h."clinicId", SUM(h."amountVnd"::numeric) AS total
        FROM escrow_holds h WHERE h.status = 'HELD'
        GROUP BY h."clinicId"
      ) held ON held."clinicId" = c.id
      LEFT JOIN (
        SELECT cw."clinicId", SUM(cw."amountVnd"::numeric) AS total
        FROM clinic_withdrawals cw WHERE cw.status = 'REQUESTED'
        GROUP BY cw."clinicId"
      ) pending ON pending."clinicId" = c.id
      LEFT JOIN (
        SELECT t."clinicId", SUM(t."amountVnd"::numeric) AS total
        FROM transactions t
        WHERE t.type = 'COMMISSION' AND t.status = 'COMPLETED'
          AND t."toAccount" = 'PLATFORM_REVENUE'
        GROUP BY t."clinicId"
      ) commission ON commission."clinicId" = c.id
      LEFT JOIN (
        SELECT cw."clinicId", MAX(cw."processedAt") AS last_payout_at
        FROM clinic_withdrawals cw WHERE cw.status = 'PAID'
        GROUP BY cw."clinicId"
      ) payout ON payout."clinicId" = c.id
      ${whereSql}
      ORDER BY c.name ASC, c.id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      itemParams,
    );

    return {
      items: rows.map((row): AdminClinicBalanceDto => ({
        clinicId: row.clinic_id,
        clinicName: row.clinic_name,
        balanceVnd: asAmountString(row.balance_vnd),
        heldEscrowVnd: asAmountString(row.held_escrow_vnd),
        pendingWithdrawalsVnd: asAmountString(row.pending_withdrawals_vnd),
        commissionEarnedVnd: asAmountString(row.commission_earned_vnd),
        lastPayoutAt:
          row.last_payout_at == null
            ? null
            : new Date(String(row.last_payout_at)),
      })),
      total,
      page,
      limit,
    };
  }
}
