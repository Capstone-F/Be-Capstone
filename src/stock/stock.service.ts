import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { ShelfLifeUnit, StockMovementType } from './enums';
import { StockBatch } from './stock-batch.entity';
import { StockMovement } from './stock-movement.entity';

export type CreateBatchInput = {
  productId: string;
  quantity: number;
  manufacturingDate: Date | string;
  batchCode?: string;
};

export type DeductByProductResult = {
  productId: string;
  totalDeducted: number;
  batches: Array<{ batchId: string; deducted: number }>;
};

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(StockBatch)
    private readonly batchRepository: Repository<StockBatch>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
  ) {}

  async createBatch(input: CreateBatchInput): Promise<StockBatch> {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const product = await this.productRepository.findOneBy({
      id: input.productId,
    });
    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }

    const manufacturingDate = this.toDateOnly(input.manufacturingDate);
    const expirationDate = this.addShelfLife(
      manufacturingDate,
      product.shelfLifeValue,
      product.shelfLifeUnit,
    );

    return this.batchRepository.manager.transaction(async (manager) => {
      const batch = manager.create(StockBatch, {
        productId: product.id,
        batchCode: input.batchCode ?? null,
        initialQuantity: input.quantity,
        remainingQuantity: input.quantity,
        manufacturingDate,
        expirationDate,
      });
      const savedBatch = await manager.save(StockBatch, batch);

      const movement = manager.create(StockMovement, {
        batchId: savedBatch.id,
        type: StockMovementType.IN,
        quantity: input.quantity,
        note: 'Initial batch stock input',
      });
      await manager.save(StockMovement, movement);

      this.logger.log(
        `Created stock batch ${savedBatch.id} for product ${product.id} (qty ${input.quantity})`,
      );

      return savedBatch;
    });
  }

  async recordMovement(
    batchId: string,
    type: StockMovementType,
    quantity: number,
    note?: string,
  ): Promise<{ batch: StockBatch; movement: StockMovement }> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    return this.batchRepository.manager.transaction(async (manager) => {
      const batch = await manager.findOne(StockBatch, {
        where: { id: batchId },
        ...this.pessimisticWriteLock(manager),
      });
      if (!batch) {
        throw new NotFoundException(`Stock batch ${batchId} not found`);
      }

      let newRemaining: number;

      switch (type) {
        case StockMovementType.IN:
          newRemaining = batch.remainingQuantity + quantity;
          break;
        case StockMovementType.OUT:
          newRemaining = batch.remainingQuantity - quantity;
          if (newRemaining < 0) {
            throw new BadRequestException(
              `Insufficient stock: remaining ${batch.remainingQuantity}, requested ${quantity}`,
            );
          }
          break;
        case StockMovementType.ADJUST:
          newRemaining = quantity;
          break;
        default:
          throw new BadRequestException(
            `Unknown movement type: ${type as string}`,
          );
      }

      batch.remainingQuantity = newRemaining;
      const savedBatch = await manager.save(StockBatch, batch);

      const movement = manager.create(StockMovement, {
        batchId: savedBatch.id,
        type,
        quantity,
        note: note ?? null,
      });
      const savedMovement = await manager.save(StockMovement, movement);

      return { batch: savedBatch, movement: savedMovement };
    });
  }

  /**
   * Deduct stock for a product across batches (FEFO: earliest expiration first).
   * For future order/checkout flows; not exposed as HTTP yet.
   */
  async deductByProductId(
    productId: string,
    quantity: number,
    note?: string,
  ): Promise<DeductByProductResult> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const product = await this.productRepository.findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const movementNote = note ?? 'Order deduction';

    return this.batchRepository.manager.transaction(async (manager) => {
      const batches = await manager.find(StockBatch, {
        where: { productId, remainingQuantity: MoreThan(0) },
        order: { expirationDate: 'ASC', createdAt: 'ASC' },
        ...this.pessimisticWriteLock(manager),
      });

      const available = batches.reduce(
        (sum, b) => sum + b.remainingQuantity,
        0,
      );
      if (available < quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${productId}: available ${available}, requested ${quantity}`,
        );
      }

      let needed = quantity;
      const deductions: Array<{ batchId: string; deducted: number }> = [];

      for (const batch of batches) {
        if (needed <= 0) {
          break;
        }

        const take = Math.min(batch.remainingQuantity, needed);
        batch.remainingQuantity -= take;
        needed -= take;

        await manager.save(StockBatch, batch);

        const movement = manager.create(StockMovement, {
          batchId: batch.id,
          type: StockMovementType.OUT,
          quantity: take,
          note: movementNote,
        });
        await manager.save(StockMovement, movement);

        deductions.push({ batchId: batch.id, deducted: take });
      }

      this.logger.log(
        `Deducted ${quantity} from product ${productId} across ${deductions.length} batch(es)`,
      );

      return {
        productId,
        totalDeducted: quantity,
        batches: deductions,
      };
    });
  }

  /** Expiration = manufacturing date + product shelf life (UTC date-only). */
  addShelfLife(
    manufacturingDate: Date,
    value: number,
    unit: ShelfLifeUnit,
  ): Date {
    const result = new Date(manufacturingDate.getTime());
    switch (unit) {
      case ShelfLifeUnit.DAY:
        result.setUTCDate(result.getUTCDate() + value);
        break;
      case ShelfLifeUnit.MONTH:
        result.setUTCMonth(result.getUTCMonth() + value);
        break;
      case ShelfLifeUnit.YEAR:
        result.setUTCFullYear(result.getUTCFullYear() + value);
        break;
      default:
        throw new BadRequestException(
          `Unknown shelf life unit: ${unit as string}`,
        );
    }
    return result;
  }

  /** Pessimistic locks are supported on Postgres only (not SQLite e2e driver). */
  private pessimisticWriteLock(manager: EntityManager) {
    const driverType =
      manager.connection?.driver?.options?.type ??
      this.batchRepository.manager.connection?.driver?.options?.type;
    if (driverType === 'postgres') {
      return { lock: { mode: 'pessimistic_write' as const } };
    }
    return {};
  }

  private toDateOnly(value: Date | string): Date {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid manufacturingDate');
    }
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
}
