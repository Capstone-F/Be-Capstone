import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import {
  ProductInstanceStatus,
  ShelfLifeUnit,
  StockMovementType,
} from './enums';
import { ProductInstance } from './product-instance.entity';
import { StockBatch } from './stock-batch.entity';
import { StockMovement } from './stock-movement.entity';

export type CreateBatchInput = {
  productVariantId: string;
  quantity: number;
  manufacturingDate: Date | string;
  batchCode?: string;
};

export type DeductByVariantResult = {
  productVariantId: string;
  totalDeducted: number;
  batches: Array<{ batchId: string; deducted: number }>;
};

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(StockBatch)
    private readonly batchRepository: Repository<StockBatch>,
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
    @InjectRepository(ProductInstance)
    private readonly instanceRepository: Repository<ProductInstance>,
  ) {}

  async createBatch(input: CreateBatchInput): Promise<StockBatch> {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const variant = await this.variantRepository.findOneBy({
      id: input.productVariantId,
    });
    if (!variant) {
      throw new NotFoundException(
        `Product variant ${input.productVariantId} not found`,
      );
    }

    const manufacturingDate = this.toDateOnly(input.manufacturingDate);
    const expirationDate = this.addShelfLife(
      manufacturingDate,
      variant.shelfLifeValue,
      variant.shelfLifeUnit,
    );

    return this.batchRepository.manager.transaction(async (manager) => {
      const batch = manager.create(StockBatch, {
        productVariantId: variant.id,
        batchCode: input.batchCode ?? null,
        initialQuantity: input.quantity,
        remainingQuantity: input.quantity,
        manufacturingDate,
        expirationDate,
      });
      const savedBatch = await manager.save(StockBatch, batch);

      const movement = manager.create(StockMovement, {
        batchId: savedBatch.id,
        type: StockMovementType.IMPORT,
        quantity: input.quantity,
        note: 'Initial batch stock input',
      });
      await manager.save(StockMovement, movement);

      const instances = Array.from({ length: input.quantity }, () =>
        manager.create(ProductInstance, {
          stockBatchId: savedBatch.id,
          status: ProductInstanceStatus.ON_RACK,
        }),
      );
      await manager.save(ProductInstance, instances);

      this.logger.log(
        `Created stock batch ${savedBatch.id} for variant ${variant.id} (qty ${input.quantity})`,
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
        case StockMovementType.IMPORT:
        case StockMovementType.RETURN:
          newRemaining = batch.remainingQuantity + quantity;
          break;
        case StockMovementType.SALE:
          newRemaining = batch.remainingQuantity - quantity;
          if (newRemaining < 0) {
            throw new BadRequestException(
              `Insufficient stock: remaining ${batch.remainingQuantity}, requested ${quantity}`,
            );
          }
          break;
        case StockMovementType.ADJUSTMENT:
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
   * Deduct stock for a variant across batches (FEFO: earliest expiration first).
   * For future order/checkout flows; not exposed as HTTP yet.
   */
  async deductByVariantId(
    productVariantId: string,
    quantity: number,
    note?: string,
    orderItemId?: string,
  ): Promise<DeductByVariantResult> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const variant = await this.variantRepository.findOneBy({
      id: productVariantId,
    });
    if (!variant) {
      throw new NotFoundException(
        `Product variant ${productVariantId} not found`,
      );
    }

    const movementNote = note ?? 'Order deduction';

    return this.batchRepository.manager.transaction(async (manager) => {
      const batches = await manager.find(StockBatch, {
        where: { productVariantId, remainingQuantity: MoreThan(0) },
        order: { expirationDate: 'ASC', createdAt: 'ASC' },
        ...this.pessimisticWriteLock(manager),
      });

      const available = batches.reduce(
        (sum, b) => sum + b.remainingQuantity,
        0,
      );
      if (available < quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${productVariantId}: available ${available}, requested ${quantity}`,
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

        const instances = await manager.find(ProductInstance, {
          where: {
            stockBatchId: batch.id,
            status: ProductInstanceStatus.ON_RACK,
          },
          order: { createdAt: 'ASC' },
          take,
          ...this.pessimisticWriteLock(manager),
        });

        for (const instance of instances) {
          instance.status = ProductInstanceStatus.SOLD;
          if (orderItemId) {
            instance.orderItemId = orderItemId;
          }
        }
        if (instances.length > 0) {
          await manager.save(ProductInstance, instances);
        }

        const movement = manager.create(StockMovement, {
          batchId: batch.id,
          type: StockMovementType.SALE,
          quantity: take,
          note: movementNote,
        });
        await manager.save(StockMovement, movement);

        deductions.push({ batchId: batch.id, deducted: take });
      }

      this.logger.log(
        `Deducted ${quantity} from variant ${productVariantId} across ${deductions.length} batch(es)`,
      );

      return {
        productVariantId,
        totalDeducted: quantity,
        batches: deductions,
      };
    });
  }

  /** Expiration = manufacturing date + variant shelf life (UTC date-only). */
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
