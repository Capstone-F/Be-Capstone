import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CommerceSettingKey,
  LedgerAccount,
  TransactionType,
} from '../commerce/enums';
import { CommerceSetting } from '../commerce/commerce-setting.entity';
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

@Injectable()
export class EscrowService {
  constructor(
    @InjectRepository(EscrowHold)
    private readonly escrowHoldRepo: Repository<EscrowHold>,
    @InjectRepository(CommerceSetting)
    private readonly settingRepo: Repository<CommerceSetting>,
    private readonly ledgerService: LedgerService,
    private readonly clinicWalletService: ClinicWalletService,
    private readonly walletService: WalletService,
  ) {}

  /** Floor commission so rounding remainder stays with the platform. */
  static splitCommission(
    amountVnd: number,
    ratePct: number,
  ): { commissionVnd: number; netVnd: number } {
    if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
      throw new BadRequestException('Amount must be a positive integer VND');
    }
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      throw new BadRequestException(
        'Commission rate must be between 0 and 100',
      );
    }
    const commissionVnd = Math.floor((amountVnd * ratePct) / 100);
    const netVnd = amountVnd - commissionVnd;
    return { commissionVnd, netVnd };
  }

  async getPlatformCommissionPct(): Promise<number> {
    const setting = await this.settingRepo.findOneBy({
      key: CommerceSettingKey.PLATFORM_COMMISSION_PCT,
    });
    const parsed = Number.parseFloat(setting?.value ?? '10');
    if (Number.isNaN(parsed) || parsed < 0) {
      return 10;
    }
    return Math.min(100, parsed);
  }

  async updatePlatformCommissionPct(
    userId: string,
    percent: number,
  ): Promise<number> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException(
        'Commission percent must be between 0 and 100',
      );
    }
    let setting = await this.settingRepo.findOneBy({
      key: CommerceSettingKey.PLATFORM_COMMISSION_PCT,
    });
    if (!setting) {
      setting = this.settingRepo.create({
        key: CommerceSettingKey.PLATFORM_COMMISSION_PCT,
        value: String(percent),
        updatedByUserId: userId,
      });
    } else {
      setting.value = String(percent);
      setting.updatedByUserId = userId;
    }
    await this.settingRepo.save(setting);
    return this.getPlatformCommissionPct();
  }

  async holdConsultationWithManager(
    manager: EntityManager,
    options: HoldConsultationOptions,
  ): Promise<EscrowHold> {
    const amount = this.parsePositiveAmount(options.amountVnd);
    const rate = await this.getPlatformCommissionPct();

    const existing = await manager.findOne(EscrowHold, {
      where: { consultationId: options.consultationId },
    });
    if (existing) {
      return existing;
    }

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
    const rate = await this.getPlatformCommissionPct();

    const existing = await manager.findOne(EscrowHold, {
      where: { treatmentPhaseId: options.treatmentPhaseId },
    });
    if (existing) {
      return existing;
    }

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
      throw new NotFoundException(`Escrow hold ${holdId} not found`);
    }
    if (hold.status === EscrowHoldStatus.RELEASED) {
      return hold;
    }
    if (hold.status !== EscrowHoldStatus.HELD) {
      throw new BadRequestException(
        `Escrow hold cannot be released (status: ${hold.status})`,
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
      throw new NotFoundException(`Escrow hold ${holdId} not found`);
    }
    if (hold.status === EscrowHoldStatus.REFUNDED) {
      return hold;
    }
    if (hold.status !== EscrowHoldStatus.HELD) {
      throw new BadRequestException(
        `Escrow hold cannot be refunded (status: ${hold.status})`,
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
      throw new BadRequestException('Amount must be a positive integer VND');
    }
    return amount;
  }
}
