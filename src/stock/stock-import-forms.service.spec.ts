import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import { StockImportFormStatus } from './enums';
import { StockImportForm } from './stock-import-form.entity';
import { StockImportFormsService } from './stock-import-forms.service';
import { StockService } from './stock.service';

const dateOnly = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d));

const baseForm = (overrides: Partial<StockImportForm> = {}): StockImportForm =>
  ({
    id: 'form-1',
    productVariantId: 'variant-1',
    quantity: 10,
    manufacturingDate: dateOnly(2026, 0, 15),
    batchCode: 'LOT-001',
    status: StockImportFormStatus.DRAFT,
    createdByUserId: 'user-1',
    submittedByUserId: null,
    submittedAt: null,
    confirmedByUserId: null,
    confirmedAt: null,
    cancelledByUserId: null,
    cancelledAt: null,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    stockBatchId: null,
    productVariant: {} as StockImportForm['productVariant'],
    stockBatch: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as StockImportForm;

describe('StockImportFormsService', () => {
  let service: StockImportFormsService;
  let formRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let variantRepo: { findOneBy: jest.Mock };
  let stockService: { createBatchInTransaction: jest.Mock };
  let qb: {
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    formRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest
        .fn()
        .mockImplementation((form) =>
          Promise.resolve({ ...form, id: form.id ?? 'form-1' }),
        ),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager: {
        transaction: jest.fn(),
      },
    };
    variantRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'variant-1' }),
    };
    stockService = {
      createBatchInTransaction: jest.fn(),
    };
    service = new StockImportFormsService(
      formRepo as unknown as Repository<StockImportForm>,
      variantRepo as unknown as Repository<ProductVariant>,
      stockService as unknown as StockService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a DRAFT form', async () => {
      const result = await service.create('user-1', {
        productVariantId: 'variant-1',
        quantity: 10,
        manufacturingDate: '2026-01-15',
        batchCode: 'LOT-001',
      });

      expect(result.status).toBe(StockImportFormStatus.DRAFT);
      expect(result.createdByUserId).toBe('user-1');
      expect(result.quantity).toBe(10);
      expect(formRepo.save).toHaveBeenCalled();
    });

    it('throws when variant is missing', async () => {
      variantRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.create('user-1', {
          productVariantId: 'missing',
          quantity: 1,
          manufacturingDate: '2026-01-15',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('applies filters and pagination', async () => {
      const form = baseForm();
      qb.getManyAndCount.mockResolvedValue([[form], 1]);

      const result = await service.list({
        status: StockImportFormStatus.DRAFT,
        productVariantId: 'variant-1',
        createdByUserId: 'user-1',
        page: 2,
        limit: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(3);
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.items[0].id).toBe('form-1');
    });
  });

  describe('update', () => {
    it('updates line fields while DRAFT', async () => {
      formRepo.findOneBy.mockResolvedValue(baseForm());
      const result = await service.update('form-1', { quantity: 20 });
      expect(result.quantity).toBe(20);
      expect(result.status).toBe(StockImportFormStatus.DRAFT);
    });

    it('allows update while SUBMITTED', async () => {
      formRepo.findOneBy.mockResolvedValue(
        baseForm({ status: StockImportFormStatus.SUBMITTED }),
      );
      const result = await service.update('form-1', { batchCode: 'LOT-2' });
      expect(result.batchCode).toBe('LOT-2');
      expect(result.status).toBe(StockImportFormStatus.SUBMITTED);
    });

    it('rejects update on terminal status', async () => {
      formRepo.findOneBy.mockResolvedValue(
        baseForm({ status: StockImportFormStatus.CONFIRMED }),
      );
      await expect(service.update('form-1', { quantity: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires at least one field', async () => {
      await expect(service.update('form-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submit', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      formRepo.findOneBy.mockResolvedValue(baseForm());
      const result = await service.submit('user-2', 'form-1');
      expect(result.status).toBe(StockImportFormStatus.SUBMITTED);
      expect(result.submittedByUserId).toBe('user-2');
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('rejects non-DRAFT', async () => {
      formRepo.findOneBy.mockResolvedValue(
        baseForm({ status: StockImportFormStatus.SUBMITTED }),
      );
      await expect(service.submit('user-2', 'form-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('confirm', () => {
    it('transitions SUBMITTED → CONFIRMED and links stock batch', async () => {
      const form = baseForm({ status: StockImportFormStatus.SUBMITTED });
      const manager = {
        findOne: jest.fn().mockResolvedValue(form),
        save: jest.fn().mockImplementation((_, f) => Promise.resolve(f)),
      };
      formRepo.manager.transaction.mockImplementation((cb) => cb(manager));
      stockService.createBatchInTransaction.mockResolvedValue({
        id: 'batch-1',
      });

      const result = await service.confirm('user-3', 'form-1');

      expect(stockService.createBatchInTransaction).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          productVariantId: 'variant-1',
          quantity: 10,
          batchCode: 'LOT-001',
        }),
      );
      expect(result.status).toBe(StockImportFormStatus.CONFIRMED);
      expect(result.stockBatchId).toBe('batch-1');
      expect(result.confirmedByUserId).toBe('user-3');
    });

    it('rejects non-SUBMITTED', async () => {
      const form = baseForm({ status: StockImportFormStatus.DRAFT });
      const manager = {
        findOne: jest.fn().mockResolvedValue(form),
        save: jest.fn(),
      };
      formRepo.manager.transaction.mockImplementation((cb) => cb(manager));

      await expect(service.confirm('user-3', 'form-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stockService.createBatchInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels DRAFT', async () => {
      formRepo.findOneBy.mockResolvedValue(baseForm());
      const result = await service.cancel('user-4', 'form-1');
      expect(result.status).toBe(StockImportFormStatus.CANCELLED);
      expect(result.cancelledByUserId).toBe('user-4');
    });

    it('rejects CONFIRMED', async () => {
      formRepo.findOneBy.mockResolvedValue(
        baseForm({ status: StockImportFormStatus.CONFIRMED }),
      );
      await expect(service.cancel('user-4', 'form-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('rejects SUBMITTED with reason', async () => {
      formRepo.findOneBy.mockResolvedValue(
        baseForm({ status: StockImportFormStatus.SUBMITTED }),
      );
      const result = await service.reject('user-5', 'form-1', 'Bad date');
      expect(result.status).toBe(StockImportFormStatus.REJECTED);
      expect(result.rejectedByUserId).toBe('user-5');
      expect(result.rejectionReason).toBe('Bad date');
    });

    it('rejects non-SUBMITTED', async () => {
      formRepo.findOneBy.mockResolvedValue(baseForm());
      await expect(service.reject('user-5', 'form-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getById', () => {
    it('throws when missing', async () => {
      formRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
