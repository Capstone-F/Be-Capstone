import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { ORDER_CANCELLATION_TICK_CRON_DEFAULT } from '../config/order-cancellation.config';
import { Delivery } from '../delivery/delivery.entity';
import { DeliveryStatus } from '../delivery/enums';
import { OrderCancellationStatus, OrderStatus } from './enums';
import { OrderCancellationsService } from './order-cancellations.service';
import { OrderCancellation } from './order-cancellation.entity';

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

/**
 * Cancellations themselves are applied synchronously by
 * OrderCancellationsService (order CANCELLED + AWAITING_RETURN or an inline
 * refund, in one transaction). The only scheduled job left is the sweep that
 * auto-creates a SYSTEM cancellation when a delivery comes back RETURNED.
 */
@Injectable()
export class OrderCancellationProcessor {
  private readonly logger = new Logger(OrderCancellationProcessor.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly cancellationsService: OrderCancellationsService,
    private readonly config: AppConfigService,
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

  async tick(): Promise<TickResult> {
    const autoCancelled = await this.sweepReturnedDeliveries();
    return { advanced: [], skipped: 0, autoCancelled };
  }

  /**
   * When a delivery reaches RETURNED (simulator force or real GHN webhook),
   * auto-create a SYSTEM cancellation. The cancellation applies synchronously,
   * so the order lands in AWAITING_RETURN (or is refunded inline) immediately.
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
}
