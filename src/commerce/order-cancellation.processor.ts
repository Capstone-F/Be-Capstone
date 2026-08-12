import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { ORDER_CANCELLATION_TICK_CRON_DEFAULT } from '../config/order-cancellation.config';
import { Delivery } from '../delivery/delivery.entity';
import { DeliveryStatus } from '../delivery/enums';
import { StockService } from '../stock/stock.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType, OrderCancellationStatus, OrderStatus } from './enums';
import { OrderCancellationsService } from './order-cancellations.service';
import { OrderCancellation } from './order-cancellation.entity';
import { Order } from './order.entity';

const TERMINAL_STATUSES = new Set([
  OrderCancellationStatus.COMPLETED,
  OrderCancellationStatus.FAILED,
]);

const AUTO_SKIP_STATUSES = new Set([
  OrderCancellationStatus.AWAITING_RETURN,
  ...TERMINAL_STATUSES,
]);

const MAX_ATTEMPTS = 5;

export type TickOptions = {
  /** Ignore nextRunAt so a demo does not have to wait out the step delay. */
  ignoreDelay?: boolean;
  /** Restrict the tick to a single cancellation. */
  cancellationId?: string;
  /** Advance this many stages, stopping early at AWAITING_RETURN or a terminal state. */
  steps?: number;
};

export type TickTransition = {
  cancellationId: string;
  orderId: string;
  from: OrderCancellationStatus;
  to: OrderCancellationStatus;
};

export type TickResult = {
  advanced: TickTransition[];
  skipped: number;
  autoCancelled: string[];
};

@Injectable()
export class OrderCancellationProcessor {
  private readonly logger = new Logger(OrderCancellationProcessor.name);

  constructor(
    @InjectRepository(OrderCancellation)
    private readonly cancellationRepository: Repository<OrderCancellation>,
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly cancellationsService: OrderCancellationsService,
    private readonly stockService: StockService,
    private readonly walletService: WalletService,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(
    process.env.ORDER_CANCELLATION_TICK_CRON ||
      ORDER_CANCELLATION_TICK_CRON_DEFAULT,
    {
      name: 'order-cancellation-tick',
    },
  )
  async handleCron(): Promise<void> {
    if (!this.config.orderCancellationConfig.cronEnabled) {
      return;
    }
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(
        'Order cancellation tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async tick(options: TickOptions = {}): Promise<TickResult> {
    const steps = Math.max(1, options.steps ?? 1);
    const result: TickResult = {
      advanced: [],
      skipped: 0,
      autoCancelled: [],
    };

    // Single-cancellation advances skip the RETURNED sweep — demos drive one row.
    if (!options.cancellationId) {
      result.autoCancelled = await this.sweepReturnedDeliveries();
    }

    if (options.cancellationId) {
      for (let i = 0; i < steps; i++) {
        const claimed = await this.claimDue({
          ignoreDelay: options.ignoreDelay ?? false,
          cancellationId: options.cancellationId,
          limit: 1,
        });
        if (claimed.length === 0) {
          result.skipped += 1;
          break;
        }
        const row = claimed[0];
        if (AUTO_SKIP_STATUSES.has(row.status)) {
          result.skipped += 1;
          break;
        }
        const transition = await this.advanceSafely(row);
        if (!transition) {
          result.skipped += 1;
          break;
        }
        result.advanced.push(transition);
        if (AUTO_SKIP_STATUSES.has(transition.to)) {
          break;
        }
      }
      return result;
    }

    const claimed = await this.claimDue({
      ignoreDelay: options.ignoreDelay ?? false,
      limit: this.config.orderCancellationConfig.batchSize,
    });
    if (claimed.length === 0) {
      return result;
    }

    for (const row of claimed) {
      const transition = await this.advanceSafely(row);
      if (transition) {
        result.advanced.push(transition);
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }

  /**
   * When a delivery reaches RETURNED (simulator force or real GHN webhook),
   * auto-create a SYSTEM cancellation so refund + restock kick off.
   */
  private async sweepReturnedDeliveries(): Promise<string[]> {
    const batchSize = this.config.orderCancellationConfig.batchSize;
    const candidates = await this.deliveryRepository
      .createQueryBuilder('d')
      .innerJoin('d.order', 'order')
      .leftJoin(OrderCancellation, 'c', 'c.orderId = d.orderId')
      .where('d.status = :status', { status: DeliveryStatus.RETURNED })
      .andWhere('c.id IS NULL')
      .andWhere('order.status NOT IN (:...blocked)', {
        blocked: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      })
      .orderBy('d.updatedAt', 'ASC')
      .take(batchSize)
      .getMany();

    const created: string[] = [];
    for (const delivery of candidates) {
      try {
        await this.cancellationsService.requestBySystem(
          delivery.orderId,
          'Auto-cancelled after delivery returned',
        );
        created.push(delivery.orderId);
        this.logger.log(
          `SYSTEM cancellation created for returned delivery order ${delivery.orderId}`,
        );
      } catch (error) {
        if (error instanceof ConflictException) {
          // Customer/staff cancel raced us — fine.
          continue;
        }
        this.logger.error(
          `Failed to auto-cancel returned order ${delivery.orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return created;
  }

  private async claimDue(options: {
    ignoreDelay: boolean;
    cancellationId?: string;
    limit: number;
  }): Promise<OrderCancellation[]> {
    const isPg = this.isPostgres();

    const runClaim = async (manager: EntityManager) => {
      const qb = manager
        .createQueryBuilder(OrderCancellation, 'c')
        .leftJoinAndSelect('c.items', 'items')
        .where('c.status NOT IN (:...skip)', {
          skip: [...AUTO_SKIP_STATUSES],
        })
        .orderBy('c.nextRunAt', 'ASC')
        .take(options.limit);

      if (!options.ignoreDelay) {
        qb.andWhere('c.nextRunAt <= :now', { now: new Date() });
      }
      if (options.cancellationId) {
        qb.andWhere('c.id = :id', { id: options.cancellationId });
      }

      if (isPg) {
        // Lock only the root row — Postgres rejects FOR UPDATE on LEFT JOIN null side (items).
        qb.setLock('pessimistic_write', undefined, ['c']).setOnLocked(
          'skip_locked',
        );
      }

      return qb.getMany();
    };

    if (isPg) {
      return this.dataSource.transaction((manager) => runClaim(manager));
    }
    return runClaim(this.cancellationRepository.manager);
  }

  private async advanceSafely(
    cancellation: OrderCancellation,
  ): Promise<TickTransition | null> {
    const from = cancellation.status;
    try {
      const to = await this.advance(cancellation);
      if (to === from) {
        return null;
      }
      return {
        cancellationId: cancellation.id,
        orderId: cancellation.orderId,
        from,
        to,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to advance cancellation ${cancellation.id} from ${from}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.recordFailure(cancellation.id, message);
      return null;
    }
  }

  private async advance(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    switch (cancellation.status) {
      case OrderCancellationStatus.REQUESTED:
        return this.advanceRequested(cancellation);
      case OrderCancellationStatus.REFUNDING:
        return this.advanceRefunding(cancellation);
      case OrderCancellationStatus.REFUNDED:
        return this.advanceRefunded(cancellation);
      case OrderCancellationStatus.RESTOCKED:
        return this.advanceRestocked(cancellation);
      default:
        return cancellation.status;
    }
  }

  private async advanceRequested(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    const refundAmount = BigInt(cancellation.refundAmountVnd);
    if (refundAmount > 0n) {
      await this.dataSource.transaction(async (manager) => {
        await this.markOrderCancelled(manager, cancellation.orderId);
        await manager.update(
          OrderCancellation,
          { id: cancellation.id, status: OrderCancellationStatus.REQUESTED },
          {
            status: OrderCancellationStatus.REFUNDING,
            nextRunAt: this.cancellationsService.stepDelayFromNow(),
            lastError: null,
          },
        );
      });
      return OrderCancellationStatus.REFUNDING;
    }
    if (cancellation.requiresStockReturn) {
      await this.dataSource.transaction(async (manager) => {
        await this.markOrderCancelled(manager, cancellation.orderId);
        await this.markInstancesInTransit(manager, cancellation);
        await manager.update(
          OrderCancellation,
          { id: cancellation.id, status: OrderCancellationStatus.REQUESTED },
          {
            status: OrderCancellationStatus.AWAITING_RETURN,
            nextRunAt: this.cancellationsService.stepDelayFromNow(),
            lastError: null,
          },
        );
      });
      return OrderCancellationStatus.AWAITING_RETURN;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.markOrderCancelled(manager, cancellation.orderId);
      await manager.update(
        OrderCancellation,
        { id: cancellation.id, status: OrderCancellationStatus.REQUESTED },
        {
          status: OrderCancellationStatus.COMPLETED,
          nextRunAt: this.cancellationsService.stepDelayFromNow(),
          lastError: null,
        },
      );
    });
    return OrderCancellationStatus.COMPLETED;
  }

  private async advanceRefunding(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    await this.dataSource.transaction(async (manager) => {
      const updated = await manager.update(
        OrderCancellation,
        { id: cancellation.id, status: OrderCancellationStatus.REFUNDING },
        { status: OrderCancellationStatus.REFUNDED },
      );
      if (!updated.affected) {
        return;
      }

      const order = await manager.findOne(Order, {
        where: { id: cancellation.orderId },
        relations: ['customer'],
      });
      if (!order?.customer?.userId) {
        throw new Error(
          `Cannot refund order ${cancellation.orderId}: customer userId missing`,
        );
      }

      const tx = await this.walletService.creditWithManager(manager, {
        type: TransactionType.REFUND,
        amountVnd: cancellation.refundAmountVnd,
        userId: order.customer.userId,
        orderId: order.id,
        note: `Refund for cancelled order ${order.id}`,
        externalRef: `order-cancellation:${cancellation.id}`,
      });

      await manager.update(
        OrderCancellation,
        { id: cancellation.id },
        {
          refundTransactionId: tx.id,
          refundedAt: new Date(),
          nextRunAt: this.cancellationsService.stepDelayFromNow(),
          lastError: null,
        },
      );
      await manager.update(
        Order,
        { id: order.id },
        { status: OrderStatus.REFUNDED },
      );
    });
    return OrderCancellationStatus.REFUNDED;
  }

  private async advanceRefunded(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    if (!cancellation.requiresStockReturn) {
      await this.cancellationRepository.update(
        { id: cancellation.id, status: OrderCancellationStatus.REFUNDED },
        {
          status: OrderCancellationStatus.COMPLETED,
          nextRunAt: this.cancellationsService.stepDelayFromNow(),
          lastError: null,
        },
      );
      return OrderCancellationStatus.COMPLETED;
    }
    return this.markInTransitAndAwait(cancellation);
  }

  private async markInTransitAndAwait(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    await this.dataSource.transaction(async (manager) => {
      await this.markInstancesInTransit(manager, cancellation);
      await manager.update(
        OrderCancellation,
        { id: cancellation.id, status: OrderCancellationStatus.REFUNDED },
        {
          status: OrderCancellationStatus.AWAITING_RETURN,
          nextRunAt: this.cancellationsService.stepDelayFromNow(),
          lastError: null,
        },
      );
    });
    return OrderCancellationStatus.AWAITING_RETURN;
  }

  private async markInstancesInTransit(
    manager: EntityManager,
    cancellation: OrderCancellation,
  ): Promise<void> {
    for (const item of cancellation.items ?? []) {
      await this.stockService.markInstancesInReturnTransit(
        manager,
        item.orderItemId,
      );
    }
  }

  private async markOrderCancelled(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    await manager.update(
      Order,
      { id: orderId },
      { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    );
  }

  private async advanceRestocked(
    cancellation: OrderCancellation,
  ): Promise<OrderCancellationStatus> {
    await this.cancellationRepository.update(
      { id: cancellation.id, status: OrderCancellationStatus.RESTOCKED },
      {
        status: OrderCancellationStatus.COMPLETED,
        nextRunAt: this.cancellationsService.stepDelayFromNow(),
        lastError: null,
      },
    );
    return OrderCancellationStatus.COMPLETED;
  }

  private async recordFailure(
    cancellationId: string,
    message: string,
  ): Promise<void> {
    const row = await this.cancellationRepository.findOneBy({
      id: cancellationId,
    });
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return;
    }
    const attempts = row.attempts + 1;
    const delaySec = this.config.orderCancellationConfig.stepDelaySec;
    const backoffMs = delaySec * 1000 * Math.min(attempts, 8);
    await this.cancellationRepository.update(
      { id: cancellationId },
      {
        attempts,
        lastError: message.slice(0, 2000),
        nextRunAt: new Date(Date.now() + backoffMs),
        status:
          attempts >= MAX_ATTEMPTS
            ? OrderCancellationStatus.FAILED
            : row.status,
      },
    );
  }

  private isPostgres(): boolean {
    return (
      this.cancellationRepository.manager.connection?.driver?.options?.type ===
      'postgres'
    );
  }
}
