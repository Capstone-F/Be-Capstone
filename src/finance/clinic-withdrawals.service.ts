import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { LedgerAccount, TransactionType } from '../commerce/enums';
import { LedgerService } from './ledger.service';
import { ClinicWalletService } from './clinic-wallet.service';
import { ClinicWithdrawal } from './clinic-withdrawal.entity';
import { ClinicWithdrawalStatus } from './enums';
import {
  ClinicWithdrawalResponseDto,
  PaginatedClinicWithdrawalsDto,
} from './dto/clinic-withdrawal-response.dto';

@Injectable()
export class ClinicWithdrawalsService {
  constructor(
    @InjectRepository(ClinicWithdrawal)
    private readonly withdrawalRepo: Repository<ClinicWithdrawal>,
    @InjectRepository(Clinic)
    private readonly clinicRepo: Repository<Clinic>,
    private readonly clinicWalletService: ClinicWalletService,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async requestWithdrawal(
    clinicId: string,
    requestedByUserId: string,
    amountVnd: number,
  ): Promise<ClinicWithdrawalResponseDto> {
    if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
      throw new BadRequestException('Số tiền phải là số nguyên dương VND');
    }

    const clinic = await this.clinicRepo.findOne({ where: { id: clinicId } });
    if (!clinic) {
      throw new NotFoundException(`Không tìm thấy phòng khám ${clinicId}`);
    }
    if (
      !clinic.bankName?.trim() ||
      !clinic.bankAccountNumber?.trim() ||
      !clinic.bankAccountHolder?.trim()
    ) {
      throw new BadRequestException(
        'Phải thiết lập tài khoản ngân hàng của phòng khám trước khi tạo yêu cầu rút tiền',
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.clinicWalletService.debitWithManager(
        manager,
        clinicId,
        amountVnd,
      );

      const withdrawal = manager.create(ClinicWithdrawal, {
        clinicId,
        amountVnd: String(amountVnd),
        status: ClinicWithdrawalStatus.REQUESTED,
        requestedByUserId,
        bankName: clinic.bankName!.trim(),
        bankAccountNumber: clinic.bankAccountNumber!.trim(),
        bankAccountHolder: clinic.bankAccountHolder!.trim(),
      });
      const created = await manager.save(ClinicWithdrawal, withdrawal);

      const debitTx = await this.ledgerService.writeWithManager(manager, {
        type: TransactionType.WITHDRAWAL,
        amountVnd,
        fromAccount: LedgerAccount.CLINIC_WALLET,
        toAccount: LedgerAccount.BANK_OUT,
        externalRef: `clinic-withdrawal:${created.id}`,
        clinicId,
        withdrawalId: created.id,
        userId: requestedByUserId,
        note: `Clinic withdrawal request ${created.id}`,
      });

      created.debitTransactionId = debitTx.id;
      return manager.save(ClinicWithdrawal, created);
    });

    return this.toDto(saved);
  }

  async markPaid(
    withdrawalId: string,
    processedByUserId: string,
    transferRef?: string,
    note?: string,
  ): Promise<ClinicWithdrawalResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const withdrawal = await manager
        .getRepository(ClinicWithdrawal)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id: withdrawalId })
        .getOne();

      if (!withdrawal) {
        throw new NotFoundException(
          `Không tìm thấy yêu cầu rút tiền ${withdrawalId}`,
        );
      }
      if (withdrawal.status === ClinicWithdrawalStatus.PAID) {
        return withdrawal;
      }
      if (withdrawal.status !== ClinicWithdrawalStatus.REQUESTED) {
        throw new BadRequestException(
          `Yêu cầu rút tiền chỉ có thể được đánh dấu đã thanh toán từ trạng thái REQUESTED (hiện tại: ${withdrawal.status})`,
        );
      }

      withdrawal.status = ClinicWithdrawalStatus.PAID;
      withdrawal.processedByUserId = processedByUserId;
      withdrawal.processedAt = new Date();
      withdrawal.transferRef = transferRef?.trim() || null;
      withdrawal.staffNote = note?.trim() || null;
      return manager.save(ClinicWithdrawal, withdrawal);
    });

    return this.toDto(saved);
  }

  async reject(
    withdrawalId: string,
    processedByUserId: string,
    note?: string,
  ): Promise<ClinicWithdrawalResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const withdrawal = await manager
        .getRepository(ClinicWithdrawal)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id: withdrawalId })
        .getOne();

      if (!withdrawal) {
        throw new NotFoundException(
          `Không tìm thấy yêu cầu rút tiền ${withdrawalId}`,
        );
      }
      if (withdrawal.status === ClinicWithdrawalStatus.REJECTED) {
        return withdrawal;
      }
      if (withdrawal.status !== ClinicWithdrawalStatus.REQUESTED) {
        throw new BadRequestException(
          `Yêu cầu rút tiền chỉ có thể bị từ chối từ trạng thái REQUESTED (hiện tại: ${withdrawal.status})`,
        );
      }

      await this.clinicWalletService.creditWithManager(
        manager,
        withdrawal.clinicId,
        withdrawal.amountVnd,
      );

      const refundTx = await this.ledgerService.writeWithManager(manager, {
        type: TransactionType.WITHDRAWAL_REVERSAL,
        amountVnd: withdrawal.amountVnd,
        fromAccount: LedgerAccount.BANK_OUT,
        toAccount: LedgerAccount.CLINIC_WALLET,
        externalRef: `clinic-withdrawal-reversal:${withdrawal.id}`,
        clinicId: withdrawal.clinicId,
        withdrawalId: withdrawal.id,
        userId: processedByUserId,
        note: `Rejected clinic withdrawal ${withdrawal.id}`,
      });

      withdrawal.status = ClinicWithdrawalStatus.REJECTED;
      withdrawal.processedByUserId = processedByUserId;
      withdrawal.processedAt = new Date();
      withdrawal.staffNote = note?.trim() || null;
      withdrawal.refundTransactionId = refundTx.id;
      return manager.save(ClinicWithdrawal, withdrawal);
    });

    return this.toDto(saved);
  }

  async listForClinic(
    clinicId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedClinicWithdrawalsDto> {
    const take = Math.min(100, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;

    const [items, total] = await this.withdrawalRepo.findAndCount({
      where: { clinicId },
      relations: ['clinic'],
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return {
      items: items.map((w) => this.toDto(w)),
      total,
      page: Math.max(1, page),
      limit: take,
    };
  }

  async listAdmin(query: {
    clinicId?: string;
    status?: ClinicWithdrawalStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedClinicWithdrawalsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.withdrawalRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.clinic', 'clinic')
      .orderBy('w.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.clinicId) {
      qb.andWhere('w.clinicId = :clinicId', { clinicId: query.clinicId });
    }
    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((w) => this.toDto(w)),
      total,
      page,
      limit,
    };
  }

  async getOneForClinic(
    clinicId: string,
    withdrawalId: string,
  ): Promise<ClinicWithdrawalResponseDto> {
    const withdrawal = await this.withdrawalRepo.findOne({
      where: { id: withdrawalId },
      relations: ['clinic'],
    });
    if (!withdrawal) {
      throw new NotFoundException(
        `Không tìm thấy yêu cầu rút tiền ${withdrawalId}`,
      );
    }
    if (withdrawal.clinicId !== clinicId) {
      throw new ForbiddenException(
        'Yêu cầu rút tiền không thuộc về phòng khám này',
      );
    }
    return this.toDto(withdrawal);
  }

  private toDto(w: ClinicWithdrawal): ClinicWithdrawalResponseDto {
    return {
      id: w.id,
      clinicId: w.clinicId,
      clinicName: w.clinic?.name || null,
      amountVnd: w.amountVnd,
      status: w.status,
      requestedByUserId: w.requestedByUserId,
      bankName: w.bankName,
      bankAccountNumber: w.bankAccountNumber,
      bankAccountHolder: w.bankAccountHolder,
      processedByUserId: w.processedByUserId,
      processedAt: w.processedAt,
      transferRef: w.transferRef,
      staffNote: w.staffNote,
      debitTransactionId: w.debitTransactionId,
      refundTransactionId: w.refundTransactionId,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }
}
