import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ClinicWallet } from './clinic-wallet.entity';

@Injectable()
export class ClinicWalletService {
  constructor(
    @InjectRepository(ClinicWallet)
    private readonly clinicWalletRepo: Repository<ClinicWallet>,
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreate(clinicId: string): Promise<ClinicWallet> {
    let wallet = await this.clinicWalletRepo.findOne({ where: { clinicId } });
    if (wallet) {
      return wallet;
    }
    wallet = this.clinicWalletRepo.create({
      clinicId,
      balanceVnd: '0',
      isActive: true,
    });
    return this.clinicWalletRepo.save(wallet);
  }

  async getBalance(clinicId: string): Promise<ClinicWallet> {
    return this.getOrCreate(clinicId);
  }

  async creditWithManager(
    manager: EntityManager,
    clinicId: string,
    amountVnd: number | string,
  ): Promise<ClinicWallet> {
    const amount = this.parsePositiveAmount(amountVnd);
    const wallet = await this.lockWallet(manager, clinicId);
    this.assertWalletActive(wallet);
    wallet.balanceVnd = String(BigInt(wallet.balanceVnd) + BigInt(amount));
    return manager.save(ClinicWallet, wallet);
  }

  async debitWithManager(
    manager: EntityManager,
    clinicId: string,
    amountVnd: number | string,
  ): Promise<ClinicWallet> {
    const amount = this.parsePositiveAmount(amountVnd);
    const wallet = await this.lockWallet(manager, clinicId);
    this.assertWalletActive(wallet);

    const balance = BigInt(wallet.balanceVnd);
    if (balance < BigInt(amount)) {
      throw new BadRequestException('Số dư ví phòng khám không đủ');
    }

    wallet.balanceVnd = String(balance - BigInt(amount));
    return manager.save(ClinicWallet, wallet);
  }

  private async lockWallet(
    manager: EntityManager,
    clinicId: string,
  ): Promise<ClinicWallet> {
    let wallet = await manager
      .getRepository(ClinicWallet)
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.clinicId = :clinicId', { clinicId })
      .getOne();

    if (!wallet) {
      wallet = manager.create(ClinicWallet, {
        clinicId,
        balanceVnd: '0',
        isActive: true,
      });
      wallet = await manager.save(ClinicWallet, wallet);
      wallet = await manager
        .getRepository(ClinicWallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id: wallet.id })
        .getOne();
    }

    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví phòng khám');
    }
    return wallet;
  }

  private assertWalletActive(wallet: ClinicWallet): void {
    if (!wallet.isActive) {
      throw new BadRequestException('Ví phòng khám không hoạt động');
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
