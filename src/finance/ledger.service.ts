import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  LedgerAccount,
  TransactionStatus,
  TransactionType,
} from '../commerce/enums';
import { Transaction } from '../commerce/transaction.entity';

export type LedgerWriteOptions = {
  type: TransactionType;
  amountVnd: number | string;
  fromAccount: LedgerAccount;
  toAccount: LedgerAccount;
  externalRef: string;
  userId?: string | null;
  clinicId?: string | null;
  expertId?: string | null;
  consultationId?: string | null;
  treatmentId?: string | null;
  treatmentPhaseId?: string | null;
  orderId?: string | null;
  escrowHoldId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

@Injectable()
export class LedgerService {
  async writeWithManager(
    manager: EntityManager,
    options: LedgerWriteOptions,
  ): Promise<Transaction> {
    const existing = await manager.findOne(Transaction, {
      where: { externalRef: options.externalRef },
    });
    if (existing) {
      return existing;
    }

    const amount =
      typeof options.amountVnd === 'string'
        ? options.amountVnd
        : String(options.amountVnd);

    const tx = manager.create(Transaction, {
      type: options.type,
      status: TransactionStatus.COMPLETED,
      amountVnd: amount,
      fromAccount: options.fromAccount,
      toAccount: options.toAccount,
      externalRef: options.externalRef,
      userId: options.userId ?? null,
      clinicId: options.clinicId ?? null,
      expertId: options.expertId ?? null,
      consultationId: options.consultationId ?? null,
      treatmentId: options.treatmentId ?? null,
      treatmentPhaseId: options.treatmentPhaseId ?? null,
      orderId: options.orderId ?? null,
      escrowHoldId: options.escrowHoldId ?? null,
      withdrawalId: options.withdrawalId ?? null,
      note: options.note ?? null,
    });
    return manager.save(Transaction, tx);
  }
}
