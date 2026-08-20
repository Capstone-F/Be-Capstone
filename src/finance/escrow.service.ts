import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { LedgerAccount, TransactionType } from '../commerce/enums';
import { WalletService } from '../wallet/wallet.service';
import { ClinicWalletService } from './clinic-wallet.service';
import { EscrowHold } from './escrow-hold.entity';
import { EscrowHoldSourceType, EscrowHoldStatus } from './enums';
import { LedgerService } from './ledger.service';

export type HoldConsultationOptions = {
  consultationId: string;
  clinicId: string;
  expertId: string;
  customerUserId: string;
  amountVnd: number | string;
  holdTransactionId: string;
};

export type HoldTreatmentPhaseOptions = {
  treatmentId: string;
  treatmentPhaseId: string;
  clinicId: string;
  expertId: string;
  customerUserId: string;
  amountVnd: number | string;
  holdTransactionId: string;
};

/** Gross escrow amounts (VND bigint strings) per state for one treatment. */
export type EscrowTreatmentSummary = {
  heldVnd: string;
  releasedVnd: string;
  refundedVnd: string;
};

@Injectable()
export class EscrowService {
  constructor(
    @InjectRepository(EscrowHold)
    private readonly escrowHoldRepo: Repository<EscrowHold>,
    @InjectRepository(Clinic)
    private readonly clinicRepo: Repository<Clinic>,
    private readonly ledgerService: LedgerService,
    private readonly clinicWalletService: ClinicWalletService,
    private readonly walletService: WalletService,
  ) {}

  /** Floor commission so the rounding remainder stays with the clinic. */
  static splitCommission(
    amountVnd: number,
    ratePct: number,
  ): { commissionVnd: number; netVnd: number } {
    if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
      throw new BadRequestException('Số tiền phải là số nguyên dương VND');
    }
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      throw new BadRequestException(
        'Tỷ lệ hoa hồng phải nằm trong khoảng từ 0 đến 100',
      );
    }
    const commissionVnd = Math.floor((amountVnd * ratePct) / 100);
    const netVnd = amountVnd - commissionVnd;
    return { commissionVnd, netVnd };
  }

  async holdConsultationWithManager(
    manager: EntityManager,
    options: HoldConsultationOptions,
  ): Promise<EscrowHold> {
    const amount = this.parsePositiveAmount(options.amountVnd);

    const existing = await manager.findOne(EscrowHold, {
      where: { consultationId: options.consultationId },
    });
    if (existing) {
      return existing;
    }
    const rate = await this.getClinicCommissionPct(options.clinicId);

    const hold = manager.create(EscrowHold, {
      sourceType: EscrowHoldSourceType.CONSULTATION,
      status: EscrowHoldStatus.HELD,
      amountVnd: String(amount),
      commissionRatePct: String(rate),
      clinicId: options.clinicId,
      expertId: options.expertId,
      customerUserId: options.customerUserId,
      consultationId: options.consultationId,
      treatmentId: null,
      treatmentPhaseId: null,
      holdTransactionId: options.holdTransactionId,
    });
    return manager.save(EscrowHold, hold);
  }

  async holdTreatmentPhaseWithManager(
    manager: EntityManager,
    options: HoldTreatmentPhaseOptions,
  ): Promise<EscrowHold> {
    const amount = this.parsePositiveAmount(options.amountVnd);

    const existing = await manager.findOne(EscrowHold, {
      where: { treatmentPhaseId: options.treatmentPhaseId },
    });
    if (existing) {
      return existing;
    }
    const rate = await this.getClinicCommissionPct(options.clinicId);

    const hold = manager.create(EscrowHold, {
      sourceType: EscrowHoldSourceType.TREATMENT_PHASE,
      status: EscrowHoldStatus.HELD,
      amountVnd: String(amount),
      commissionRatePct: String(rate),
      clinicId: options.clinicId,
      expertId: options.expertId,
      customerUserId: options.customerUserId,
      consultationId: null,
      treatmentId: options.treatmentId,
      treatmentPhaseId: options.treatmentPhaseId,
      holdTransactionId: options.holdTransactionId,
    });
    return manager.save(EscrowHold, hold);
  }

  async releaseWithManager(
    manager: EntityManager,
    holdId: string,
  ): Promise<EscrowHold | null> {
    const hold = await this.lockHold(manager, holdId);
    if (!hold) {
      throw new NotFoundException(`Không tìm thấy khoản ký quỹ ${holdId}`);
    }
    if (hold.status === EscrowHoldStatus.RELEASED) {
      return hold;
    }
    if (hold.status !== EscrowHoldStatus.HELD) {
      throw new BadRequestException(
        `Không thể giải ngân khoản ký quỹ (trạng thái: ${hold.status})`,
      );
    }

    const amount = Number(hold.amountVnd);
    const rate = Number(hold.commissionRatePct);
    const { commissionVnd, netVnd } = EscrowService.splitCommission(
      amount,
      rate,
    );

    let releaseTxId: string | null = null;
    if (netVnd > 0) {
      await this.clinicWalletService.creditWithManager(
        manager,
        hold.clinicId,
        netVnd,
      );
      const releaseTx = await this.ledgerService.writeWithManager(manager, {
        type: TransactionType.ESCROW_RELEASE,
        amountVnd: netVnd,
        fromAccount: LedgerAccount.PLATFORM_ESCROW,
        toAccount: LedgerAccount.CLINIC_WALLET,
        externalRef: `escrow-release:${hold.id}`,
        clinicId: hold.clinicId,
        expertId: hold.expertId,
        userId: hold.customerUserId,
        consultationId: hold.consultationId,
        treatmentId: hold.treatmentId,
        treatmentPhaseId: hold.treatmentPhaseId,
        escrowHoldId: hold.id,
        note: `Escrow release net for hold ${hold.id}`,
      });
      releaseTxId = releaseTx.id;
    }

    let commissionTxId: string | null = null;
    if (commissionVnd > 0) {
      const commissionTx = await this.ledgerService.writeWithManager(manager, {
        type: TransactionType.COMMISSION,
        amountVnd: commissionVnd,
        fromAccount: LedgerAccount.PLATFORM_ESCROW,
        toAccount: LedgerAccount.PLATFORM_REVENUE,
        externalRef: `escrow-commission:${hold.id}`,
        clinicId: hold.clinicId,
        expertId: hold.expertId,
        userId: hold.customerUserId,
        consultationId: hold.consultationId,
        treatmentId: hold.treatmentId,
        treatmentPhaseId: hold.treatmentPhaseId,
        escrowHoldId: hold.id,
        note: `Platform commission for hold ${hold.id}`,
      });
      commissionTxId = commissionTx.id;
    }

    hold.status = EscrowHoldStatus.RELEASED;
    hold.netVnd = String(netVnd);
    hold.commissionVnd = String(commissionVnd);
    hold.releaseTransactionId = releaseTxId;
    hold.commissionTransactionId = commissionTxId;
    hold.releasedAt = new Date();
    return manager.save(EscrowHold, hold);
  }

  async refundWithManager(
    manager: EntityManager,
    holdId: string,
  ): Promise<EscrowHold | null> {
    const hold = await this.lockHold(manager, holdId);
    if (!hold) {
      throw new NotFoundException(`Không tìm thấy khoản ký quỹ ${holdId}`);
    }
    if (hold.status === EscrowHoldStatus.REFUNDED) {
      return hold;
    }
    if (hold.status !== EscrowHoldStatus.HELD) {
      throw new BadRequestException(
        `Không thể hoàn tiền khoản ký quỹ (trạng thái: ${hold.status})`,
      );
    }

    const amount = Number(hold.amountVnd);
    const refundTx = await this.walletService.creditWithManager(manager, {
      type: TransactionType.REFUND,
      amountVnd: amount,
      userId: hold.customerUserId,
      consultationId: hold.consultationId,
      treatmentId: hold.treatmentId,
      treatmentPhaseId: hold.treatmentPhaseId,
      clinicId: hold.clinicId,
      expertId: hold.expertId,
      escrowHoldId: hold.id,
      fromAccount: LedgerAccount.PLATFORM_ESCROW,
      toAccount: LedgerAccount.CUSTOMER_WALLET,
      externalRef: `escrow-refund:${hold.id}`,
      note: `Refund escrow hold ${hold.id}`,
    });

    hold.status = EscrowHoldStatus.REFUNDED;
    hold.refundTransactionId = refundTx.id;
    hold.refundedAt = new Date();
    return manager.save(EscrowHold, hold);
  }

  async findHeldByConsultation(
    manager: EntityManager,
    consultationId: string,
  ): Promise<EscrowHold | null> {
    return manager.findOne(EscrowHold, {
      where: { consultationId, status: EscrowHoldStatus.HELD },
    });
  }

  async findByConsultation(
    manager: EntityManager,
    consultationId: string,
  ): Promise<EscrowHold | null> {
    return manager.findOne(EscrowHold, {
      where: { consultationId },
    });
  }

  async findHeldByTreatmentPhase(
    manager: EntityManager,
    treatmentPhaseId: string,
  ): Promise<EscrowHold | null> {
    return manager.findOne(EscrowHold, {
      where: { treatmentPhaseId, status: EscrowHoldStatus.HELD },
    });
  }

  async findHeldByTreatment(
    manager: EntityManager,
    treatmentId: string,
  ): Promise<EscrowHold[]> {
    return manager.find(EscrowHold, {
      where: { treatmentId, status: EscrowHoldStatus.HELD },
    });
  }

  async sumHeldForClinic(clinicId: string): Promise<string> {
    const result = await this.escrowHoldRepo
      .createQueryBuilder('h')
      .select('COALESCE(SUM(h.amountVnd), 0)', 'total')
      .where('h.clinicId = :clinicId', { clinicId })
      .andWhere('h.status = :status', { status: EscrowHoldStatus.HELD })
      .getRawOne<{ total: string }>();
    return result?.total ?? '0';
  }

  /**
   * Map each consultationId to its escrow hold status (if any hold exists).
   * Read-only helper for clinic oversight views; consultations without a hold
   * are simply absent from the map.
   */
  async getStatusByConsultationIds(
    consultationIds: string[],
  ): Promise<Map<string, EscrowHoldStatus>> {
    const map = new Map<string, EscrowHoldStatus>();
    if (consultationIds.length === 0) {
      return map;
    }
    const holds = await this.escrowHoldRepo.find({
      where: { consultationId: In(consultationIds) },
      select: { id: true, consultationId: true, status: true },
    });
    for (const hold of holds) {
      if (hold.consultationId) {
        map.set(hold.consultationId, hold.status);
      }
    }
    return map;
  }

  /**
   * Summarize gross escrow amounts per treatment, grouped by hold status.
   * Read-only helper for clinic oversight views.
   */
  async summarizeByTreatmentIds(
    treatmentIds: string[],
  ): Promise<Map<string, EscrowTreatmentSummary>> {
    const map = new Map<string, EscrowTreatmentSummary>();
    if (treatmentIds.length === 0) {
      return map;
    }
    const rows = await this.escrowHoldRepo
      .createQueryBuilder('h')
      .select('h.treatmentId', 'treatmentId')
      .addSelect('h.status', 'status')
      .addSelect('COALESCE(SUM(h.amountVnd), 0)', 'total')
      .where('h.treatmentId IN (:...treatmentIds)', { treatmentIds })
      .groupBy('h.treatmentId')
      .addGroupBy('h.status')
      .getRawMany<{
        treatmentId: string;
        status: EscrowHoldStatus;
        total: string;
      }>();
    for (const row of rows) {
      const current = map.get(row.treatmentId) ?? {
        heldVnd: '0',
        releasedVnd: '0',
        refundedVnd: '0',
      };
      if (row.status === EscrowHoldStatus.HELD) {
        current.heldVnd = row.total;
      } else if (row.status === EscrowHoldStatus.RELEASED) {
        current.releasedVnd = row.total;
      } else if (row.status === EscrowHoldStatus.REFUNDED) {
        current.refundedVnd = row.total;
      }
      map.set(row.treatmentId, current);
    }
    return map;
  }

  private async lockHold(
    manager: EntityManager,
    holdId: string,
  ): Promise<EscrowHold | null> {
    return manager
      .getRepository(EscrowHold)
      .createQueryBuilder('h')
      .setLock('pessimistic_write')
      .where('h.id = :holdId', { holdId })
      .getOne();
  }

  private parsePositiveAmount(value: number | string): number {
    const amount = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền phải là số nguyên dương VND');
    }
    return amount;
  }

  private async getClinicCommissionPct(clinicId: string): Promise<number> {
    const clinic = await this.clinicRepo.findOne({
      where: { id: clinicId },
      select: { id: true, commissionRatePct: true },
    });
    if (!clinic) {
      throw new NotFoundException(`Không tìm thấy phòng khám ${clinicId}`);
    }
    const rate = Number(clinic.commissionRatePct);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException(
        `Tỷ lệ hoa hồng của phòng khám ${clinicId} không hợp lệ`,
      );
    }
    return rate;
  }
}
