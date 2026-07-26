import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { TransactionType } from '../commerce/enums';
import { Transaction } from '../commerce/transaction.entity';
import { Wallet } from '../users/wallet.entity';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let walletRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let transactionRepo: Record<string, never>;
  let dataSource: { transaction: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let service: WalletService;

  beforeEach(() => {
    walletRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ ...v, id: v.id ?? 'w-1' })),
    };
    transactionRepo = {};
    dataSource = { transaction: jest.fn() };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    service = new WalletService(
      walletRepo as unknown as Repository<Wallet>,
      transactionRepo as unknown as Repository<Transaction>,
      userRepo as never,
      dataSource as unknown as DataSource,
    );
  });

  it('getOrCreateWallet creates when missing', async () => {
    walletRepo.findOne.mockResolvedValue(null);
    const wallet = await service.getOrCreateWallet('user-1');
    expect(wallet.userId).toBe('user-1');
    expect(wallet.balanceVnd).toBe('0');
  });

  it('debit rejects insufficient balance', async () => {
    dataSource.transaction.mockImplementation(
      async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          getRepository: () => ({
            createQueryBuilder: () => ({
              setLock: () => ({
                where: () => ({
                  getOne: jest.fn().mockResolvedValue({
                    id: 'w-1',
                    userId: 'user-1',
                    balanceVnd: '1000',
                    isActive: true,
                  }),
                }),
              }),
            }),
          }),
          save: jest.fn((entity, row) => Promise.resolve(row ?? entity)),
          create: jest.fn((_e, row) => row),
        };
        return cb(manager);
      },
    );

    await expect(
      service.debit({
        type: TransactionType.CONSULTATION_PAYMENT,
        amountVnd: 5000,
        userId: 'user-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debit reduces balance and writes transaction', async () => {
    const wallet = {
      id: 'w-1',
      userId: 'user-1',
      balanceVnd: '100000',
      isActive: true,
    };
    dataSource.transaction.mockImplementation(
      async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          getRepository: () => ({
            createQueryBuilder: () => ({
              setLock: () => ({
                where: () => ({
                  getOne: jest.fn().mockResolvedValue({ ...wallet }),
                }),
              }),
            }),
          }),
          save: jest.fn((_entity, row) => {
            if (row?.balanceVnd != null) {
              wallet.balanceVnd = row.balanceVnd;
            }
            return Promise.resolve({ ...row, id: row.id ?? 'tx-1' });
          }),
          create: jest.fn((_e, row) => row),
        };
        return cb(manager);
      },
    );

    const tx = await service.debit({
      type: TransactionType.TREATMENT_PLAN_PAYMENT,
      amountVnd: 40000,
      userId: 'user-1',
      treatmentId: 't-1',
    });

    expect(tx.type).toBe(TransactionType.TREATMENT_PLAN_PAYMENT);
    expect(wallet.balanceVnd).toBe('60000');
  });

  describe('adminTopUp', () => {
    it('rejects unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.adminTopUp('missing', 10000)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('credits wallet for existing user', async () => {
      const wallet = {
        id: 'w-1',
        userId: 'user-1',
        balanceVnd: '0',
        isActive: true,
      };
      dataSource.transaction.mockImplementation(
        async (cb: (m: unknown) => Promise<unknown>) => {
          const manager = {
            getRepository: () => ({
              createQueryBuilder: () => ({
                setLock: () => ({
                  where: () => ({
                    getOne: jest.fn().mockResolvedValue({ ...wallet }),
                  }),
                }),
              }),
            }),
            save: jest.fn((_entity, row) => {
              if (row?.balanceVnd != null) {
                wallet.balanceVnd = row.balanceVnd;
              }
              return Promise.resolve({ ...row, id: row.id ?? 'tx-admin-1' });
            }),
            create: jest.fn((_e, row) => row),
          };
          return cb(manager);
        },
      );
      walletRepo.findOne.mockResolvedValue(wallet);

      const result = await service.adminTopUp(
        'user-1',
        25000,
        'Support credit',
      );

      expect(result.amountVnd).toBe('25000');
      expect(result.balanceVnd).toBe('25000');
      expect(result.note).toBe('Support credit');
      expect(result.transactionId).toBe('tx-admin-1');
    });
  });
});
