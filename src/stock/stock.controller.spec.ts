import { StockMovementType } from './enums';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

describe('StockController', () => {
  const stockService = {
    createBatch: jest.fn(),
    recordMovement: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<StockService, 'createBatch' | 'recordMovement'>
  >;

  const controller = new StockController(stockService as StockService);

  beforeEach(() => jest.clearAllMocks());

  describe('POST /stock/batches', () => {
    it('should delegate to stockService.createBatch with DTO fields', async () => {
      const batch = { id: 'batch-1', initialQuantity: 100 };
      stockService.createBatch.mockResolvedValue(batch as any);

      const dto = {
        productId: 'product-1',
        quantity: 100,
        manufacturingDate: '2026-01-15',
        batchCode: 'LOT-001',
      };

      const result = await controller.importBatch(dto);

      expect(stockService.createBatch).toHaveBeenCalledWith({
        productId: 'product-1',
        quantity: 100,
        manufacturingDate: '2026-01-15',
        batchCode: 'LOT-001',
      });
      expect(result).toEqual(batch);
    });
  });

  describe('POST /stock/batches/:id/adjust', () => {
    it('should delegate to stockService.recordMovement with ADJUST', async () => {
      const response = {
        batch: { id: 'batch-1', remainingQuantity: 50 },
        movement: { id: 'mov-1', type: StockMovementType.ADJUST },
      };
      stockService.recordMovement.mockResolvedValue(response as any);

      const result = await controller.adjust('batch-1', {
        quantity: 50,
        note: 'Inventory count',
      });

      expect(stockService.recordMovement).toHaveBeenCalledWith(
        'batch-1',
        StockMovementType.ADJUST,
        50,
        'Inventory count',
      );
      expect(result).toEqual(response);
    });
  });
});
