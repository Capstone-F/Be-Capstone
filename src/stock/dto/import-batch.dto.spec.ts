import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces/features/pipe-transform.interface';
import { AdjustStockDto } from './adjust-stock.dto';
import { ImportBatchDto } from './import-batch.dto';

const bodyMetadata = (metatype: new () => unknown): ArgumentMetadata => ({
  type: 'body',
  metatype,
  data: '',
});

describe('Stock DTO validation (ValidationPipe whitelist)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  describe('ImportBatchDto', () => {
    const validBody = {
      productId: 'b09b4b9b-644f-4c55-a0ef-61f5769c921d',
      quantity: 100,
      manufacturingDate: '2026-06-14T00:00:00Z',
      batchCode: 'LOT-2026-001',
    };

    it('should preserve all fields after whitelist transform (regression)', async () => {
      const result = await pipe.transform(
        validBody,
        bodyMetadata(ImportBatchDto),
      );

      expect(result).toEqual(
        expect.objectContaining({
          productId: validBody.productId,
          quantity: validBody.quantity,
          manufacturingDate: validBody.manufacturingDate,
          batchCode: validBody.batchCode,
        }),
      );
    });

    it('should reject when productId is missing', async () => {
      const body = {
        quantity: validBody.quantity,
        manufacturingDate: validBody.manufacturingDate,
        batchCode: validBody.batchCode,
      };

      await expect(
        pipe.transform(body, bodyMetadata(ImportBatchDto)),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when quantity is not positive', async () => {
      await expect(
        pipe.transform(
          { ...validBody, quantity: 0 },
          bodyMetadata(ImportBatchDto),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when manufacturingDate is not a valid date string', async () => {
      await expect(
        pipe.transform(
          { ...validBody, manufacturingDate: 'not-a-date' },
          bodyMetadata(ImportBatchDto),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('AdjustStockDto', () => {
    it('should preserve quantity and note after whitelist transform', async () => {
      const result = await pipe.transform(
        { quantity: 50, note: 'Inventory count' },
        bodyMetadata(AdjustStockDto),
      );

      expect(result).toEqual(
        expect.objectContaining({
          quantity: 50,
          note: 'Inventory count',
        }),
      );
    });

    it('should reject when quantity is missing', async () => {
      await expect(
        pipe.transform({ note: 'only note' }, bodyMetadata(AdjustStockDto)),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
