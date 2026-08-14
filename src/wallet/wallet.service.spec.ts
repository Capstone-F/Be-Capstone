import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  LedgerAccount,
  TransactionStatus,
  TransactionType,
} from '../commerce/enums';
import { Transaction } from '../commerce/transaction.entity';
import { Wallet } from '../users/wallet.entity';
import { WalletTransactionDirection } from './enums';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let walletRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let transactionRepo: { createQueryBuilder: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let service: WalletService;

  beforeEach(() => {
    walletRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ ...v, id: v.id ?? 'w-1' })),
    };
    transactionRepo = { createQueryBuilder: jest.fn() };
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

  describe('listTransactions', () => {
    type QbMock = {
      where: jest.Mock;
      andWhere: jest.Mock;
      orderBy: jest.Mock;
      addOrderBy: jest.Mock;
      skip: jest.Mock;
      take: jest.Mock;
      getManyAndCount: jest.Mock;
    };

    const mockQueryBuilder = (rows: Partial<Transaction>[]): QbMock => {
      const qb: QbMock = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        skip: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
      };
      transactionRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    const row = (over: Partial<Transaction>): Partial<Transaction> => ({
      id: 'tx-1',
      type: TransactionType.WALLET_TOPUP,
      status: TransactionStatus.COMPLETED,
      amountVnd: '100000',
      fromAccount: null,
      toAccount: null,
      orderId: null,
      consultationId: null,
      treatmentId: null,
      treatmentPhaseId: null,
      clinicId: null,
      expertId: null,
      note: null,
      createdAt: new Date('2026-08-14T10:00:00.000Z'),
      ...over,
    });

    it('keeps only rows with a wallet leg and returns them newest first', async () => {
      const qb = mockQueryBuilder([row({})]);

      const result = await service.listTransactions('user-1', {});

      expect(qb.where).toHaveBeenCalledWith('t.userId = :userId', {
        userId: 'user-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(
          't.fromAccount IS NULL AND t.toAccount IS NULL',
        ),
        { wallet: LedgerAccount.CUSTOMER_WALLET },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('derives direction from the wallet leg, falling back to the type', async () => {
      mockQueryBuilder([
        row({
          id: 'tx-topup',
          fromAccount: LedgerAccount.EXTERNAL_GATEWAY,
          toAccount: LedgerAccount.CUSTOMER_WALLET,
        }),
        row({
          id: 'tx-order',
          type: TransactionType.PRODUCT_PURCHASE,
          fromAccount: LedgerAccount.CUSTOMER_WALLET,
          toAccount: LedgerAccount.PLATFORM_REVENUE,
        }),
        // Legacy refund written before ledger accounts existed.
        row({ id: 'tx-refund', type: TransactionType.REFUND }),
      ]);

      const result = await service.listTransactions('user-1', {});

      expect(result.items.map((t) => [t.id, t.direction])).toEqual([
        ['tx-topup', WalletTransactionDirection.CREDIT],
        ['tx-order', WalletTransactionDirection.DEBIT],
        ['tx-refund', WalletTransactionDirection.CREDIT],
      ]);
    });

    it('applies filters and clamps pagination', async () => {
      const qb = mockQueryBuilder([]);

      const result = await service.listTransactions('user-1', {
        type: TransactionType.REFUND,
        direction: WalletTransactionDirection.CREDIT,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
        page: 3,
        limit: 500,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('t.type = :type', {
        type: TransactionType.REFUND,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('t.toAccount = :wallet'),
        expect.objectContaining({
          creditTypes: [TransactionType.WALLET_TOPUP, TransactionType.REFUND],
        }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('t.createdAt >= :from', {
        from: new Date('2026-08-01T00:00:00.000Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t.createdAt <= :to', {
        to: new Date('2026-08-31T00:00:00.000Z'),
      });
      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.skip).toHaveBeenCalledWith(200);
      expect(result.limit).toBe(100);
      expect(result.page).toBe(3);
    });
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
