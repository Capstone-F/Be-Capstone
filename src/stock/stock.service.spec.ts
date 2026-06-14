import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { ShelfLifeUnit, StockMovementType } from './enums';
import { StockBatch } from './stock-batch.entity';
import { StockMovement } from './stock-movement.entity';
import { StockService } from './stock.service';

const dateOnly = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d));

type MockManager = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
};

const makeManager = (overrides: Partial<MockManager> = {}): MockManager => ({
  create: jest.fn().mockImplementation((_, data) => data),
  save: jest
    .fn()
    .mockImplementation((_, v) =>
      Promise.resolve({ ...v, id: v.id ?? 'saved-id' }),
    ),
  findOne: jest.fn(),
  find: jest.fn(),
  ...overrides,
});

const makeBatchRepo = (manager: MockManager) =>
  ({
    manager: {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    },
  }) as unknown as Repository<StockBatch>;

const makeProductRepo = (overrides: Partial<Repository<Product>> = {}) =>
  ({
    findOneBy: jest.fn(),
    ...overrides,
  }) as unknown as Repository<Product>;

const makeMovementRepo = () => ({}) as unknown as Repository<StockMovement>;

const baseProduct: Product = {
  id: 'product-1',
  name: 'Milk',
  brand: 'Test Brand',
  category: 'MOISTURIZER' as Product['category'],
  description: null,
  priceVnd: 100000,
  stockQuantity: 50,
  isActive: true,
  shelfLifeValue: 30,
  shelfLifeUnit: ShelfLifeUnit.DAY,
  productIngredients: [],
  batches: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StockService', () => {
  let service: StockService;
  let productRepo: Repository<Product>;
  let batchRepo: Repository<StockBatch>;
  let manager: MockManager;

  beforeEach(() => {
    manager = makeManager();
    productRepo = makeProductRepo();
    batchRepo = makeBatchRepo(manager);
    service = new StockService(productRepo, batchRepo, makeMovementRepo());
  });

  afterEach(() => jest.clearAllMocks());

  describe('addShelfLife', () => {
    it('should add N days', () => {
      const mfg = dateOnly(2026, 0, 15);
      const result = service.addShelfLife(mfg, 30, ShelfLifeUnit.DAY);
      expect(result.toISOString().slice(0, 10)).toBe('2026-02-14');
    });

    it('should add N months', () => {
      const mfg = dateOnly(2026, 0, 15);
      const result = service.addShelfLife(mfg, 3, ShelfLifeUnit.MONTH);
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
    });

    it('should add N years', () => {
      const mfg = dateOnly(2026, 0, 15);
      const result = service.addShelfLife(mfg, 1, ShelfLifeUnit.YEAR);
      expect(result.toISOString().slice(0, 10)).toBe('2027-01-15');
    });
  });

  describe('createBatch', () => {
    it('should throw BadRequestException when quantity <= 0', async () => {
      await expect(
        service.createBatch({
          productId: 'product-1',
          quantity: 0,
          manufacturingDate: '2026-01-15',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when product not found', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createBatch({
          productId: 'missing',
          quantity: 10,
          manufacturingDate: '2026-01-15',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create batch and IN movement in a transaction', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(baseProduct);
      const addShelfLifeSpy = jest.spyOn(service, 'addShelfLife');

      const result = await service.createBatch({
        productId: 'product-1',
        quantity: 100,
        manufacturingDate: '2026-01-15',
        batchCode: 'LOT-001',
      });

      expect(batchRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledTimes(2);
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        StockBatch,
        expect.objectContaining({
          productId: 'product-1',
          batchCode: 'LOT-001',
          initialQuantity: 100,
          remainingQuantity: 100,
        }),
      );
      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        StockMovement,
        expect.objectContaining({
          type: StockMovementType.IN,
          quantity: 100,
          note: 'Initial batch stock input',
        }),
      );
      expect(addShelfLifeSpy).toHaveBeenCalledWith(
        expect.any(Date),
        30,
        ShelfLifeUnit.DAY,
      );
      expect(result.initialQuantity).toBe(100);
      expect(result.remainingQuantity).toBe(100);
      addShelfLifeSpy.mockRestore();
    });
  });

  describe('recordMovement', () => {
    it('should throw BadRequestException when quantity <= 0', async () => {
      await expect(
        service.recordMovement('batch-1', StockMovementType.IN, 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when batch not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.recordMovement('missing', StockMovementType.IN, 5),
      ).rejects.toThrow(NotFoundException);
    });

    it('should increment remainingQuantity on IN', async () => {
      const batch = {
        id: 'batch-1',
        remainingQuantity: 50,
      } as StockBatch;
      manager.findOne.mockResolvedValue(batch);

      const { batch: saved } = await service.recordMovement(
        'batch-1',
        StockMovementType.IN,
        10,
      );

      expect(saved.remainingQuantity).toBe(60);
      expect(manager.create).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({
          type: StockMovementType.IN,
          quantity: 10,
        }),
      );
    });

    it('should decrement remainingQuantity on OUT when sufficient', async () => {
      const batch = {
        id: 'batch-1',
        remainingQuantity: 50,
      } as StockBatch;
      manager.findOne.mockResolvedValue(batch);

      const { batch: saved } = await service.recordMovement(
        'batch-1',
        StockMovementType.OUT,
        20,
      );

      expect(saved.remainingQuantity).toBe(30);
    });

    it('should throw BadRequestException on OUT when insufficient stock', async () => {
      manager.findOne.mockResolvedValue({
        id: 'batch-1',
        remainingQuantity: 5,
      } as StockBatch);

      await expect(
        service.recordMovement('batch-1', StockMovementType.OUT, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set remainingQuantity absolutely on ADJUST', async () => {
      manager.findOne.mockResolvedValue({
        id: 'batch-1',
        remainingQuantity: 50,
      } as StockBatch);

      const { batch: saved } = await service.recordMovement(
        'batch-1',
        StockMovementType.ADJUST,
        25,
        'Count correction',
      );

      expect(saved.remainingQuantity).toBe(25);
      expect(manager.create).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({
          type: StockMovementType.ADJUST,
          quantity: 25,
          note: 'Count correction',
        }),
      );
    });
  });

  describe('deductByProductId', () => {
    it('should throw BadRequestException when quantity <= 0', async () => {
      await expect(service.deductByProductId('product-1', 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when product not found', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.deductByProductId('missing', 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when insufficient stock', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(baseProduct);
      manager.find.mockResolvedValue([
        { id: 'b1', remainingQuantity: 3 } as StockBatch,
      ]);

      await expect(service.deductByProductId('product-1', 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should deduct fully from a single batch when sufficient', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(baseProduct);
      manager.find.mockResolvedValue([
        { id: 'b1', remainingQuantity: 50 } as StockBatch,
      ]);

      const result = await service.deductByProductId('product-1', 30);

      expect(result).toEqual({
        productId: 'product-1',
        totalDeducted: 30,
        batches: [{ batchId: 'b1', deducted: 30 }],
      });
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(manager.create).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({
          batchId: 'b1',
          type: StockMovementType.OUT,
          quantity: 30,
          note: 'Order deduction',
        }),
      );
    });

    it('should deduct across multiple batches in FEFO order', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(baseProduct);
      const batch1 = { id: 'b1', remainingQuantity: 10 } as StockBatch;
      const batch2 = { id: 'b2', remainingQuantity: 20 } as StockBatch;
      manager.find.mockResolvedValue([batch1, batch2]);

      const result = await service.deductByProductId(
        'product-1',
        25,
        'Order #1',
      );

      expect(result.totalDeducted).toBe(25);
      expect(result.batches).toEqual([
        { batchId: 'b1', deducted: 10 },
        { batchId: 'b2', deducted: 15 },
      ]);
      expect(batch1.remainingQuantity).toBe(0);
      expect(batch2.remainingQuantity).toBe(5);
      expect(manager.save).toHaveBeenCalledTimes(4);
      expect(manager.create).toHaveBeenCalledTimes(2);
      expect(manager.create).toHaveBeenLastCalledWith(
        StockMovement,
        expect.objectContaining({ note: 'Order #1' }),
      );
    });

    it('should not touch batches after needed reaches zero', async () => {
      (productRepo.findOneBy as jest.Mock).mockResolvedValue(baseProduct);
      const batches = [
        { id: 'b1', remainingQuantity: 30 } as StockBatch,
        { id: 'b2', remainingQuantity: 50 } as StockBatch,
        { id: 'b3', remainingQuantity: 40 } as StockBatch,
      ];
      manager.find.mockResolvedValue(batches);

      await service.deductByProductId('product-1', 30);

      expect(batches[0].remainingQuantity).toBe(0);
      expect(batches[1].remainingQuantity).toBe(50);
      expect(batches[2].remainingQuantity).toBe(40);
      expect(manager.save).toHaveBeenCalledTimes(2);
    });
  });
});
