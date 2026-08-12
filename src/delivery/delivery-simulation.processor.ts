import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrderStatus } from '../commerce/enums';
import { AppConfigService } from '../config/config.service';
import { DELIVERY_SIMULATION_TICK_CRON_DEFAULT } from '../config/delivery-simulation.config';
import { Delivery } from './delivery.entity';
import { nextSimulatedStatus } from './delivery-simulation.sequence';
import { DeliveryService } from './delivery.service';
import { DeliveryStatus } from './enums';
import { GHN_STATUS_MAP } from './ghn.status-map';

const TERMINAL_DELIVERY_STATUSES = new Set([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.FAILED,
  DeliveryStatus.RETURNED,
]);

export type DeliveryTickOptions = {
  /** Ignore the step delay so a demo does not wait between statuses. */
  ignoreDelay?: boolean;
  /** Restrict the tick to a single delivery. */
  deliveryId?: string;
  /** Advance this many happy-path steps, stopping early at delivered / off-sequence. */
  steps?: number;
};

export type DeliveryTickTransition = {
  deliveryId: string;
  orderId: string;
  providerStatus: string;
  deliveryStatus: DeliveryStatus | null;
};

export type DeliveryTickResult = {
  advanced: DeliveryTickTransition[];
  skipped: number;
};

@Injectable()
export class DeliverySimulationProcessor {
  private readonly logger = new Logger(DeliverySimulationProcessor.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly deliveryService: DeliveryService,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(
    process.env.DELIVERY_SIMULATION_TICK_CRON ||
      DELIVERY_SIMULATION_TICK_CRON_DEFAULT,
    {
      name: 'delivery-simulation-tick',
    },
  )
  async handleCron(): Promise<void> {
    if (!this.config.deliverySimulationConfig.cronEnabled) {
      return;
    }
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(
        'Delivery simulation tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async tick(options: DeliveryTickOptions = {}): Promise<DeliveryTickResult> {
    const steps = Math.max(1, options.steps ?? 1);
    const result: DeliveryTickResult = { advanced: [], skipped: 0 };

    if (options.deliveryId) {
      for (let i = 0; i < steps; i++) {
        const claimed = await this.claimDue({
          ignoreDelay: options.ignoreDelay ?? false,
          deliveryId: options.deliveryId,
          limit: 1,
        });
        if (claimed.length === 0) {
          result.skipped += 1;
          break;
        }
        const transition = await this.advanceSafely(claimed[0], i);
        if (!transition) {
          result.skipped += 1;
          break;
        }
        result.advanced.push(transition);
        if (
          transition.deliveryStatus !== null &&
          TERMINAL_DELIVERY_STATUSES.has(transition.deliveryStatus)
        ) {
          break;
        }
      }
      return result;
    }

    const claimed = await this.claimDue({
      ignoreDelay: options.ignoreDelay ?? false,
      limit: this.config.deliverySimulationConfig.batchSize,
    });
    if (claimed.length === 0) {
      return result;
    }

    for (const row of claimed) {
      const transition = await this.advanceSafely(row, 0);
      if (transition) {
        result.advanced.push(transition);
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }

  async forceStatus(
    deliveryId: string,
    providerStatus: string,
    note?: string,
  ): Promise<{
    applied: boolean;
    deliveryStatus: DeliveryStatus | null;
  }> {
    if (!GHN_STATUS_MAP[providerStatus]) {
      throw new BadRequestException(
        `Unknown provider status: ${providerStatus}`,
      );
    }

    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }
    if (!delivery.providerOrderCode) {
      throw new BadRequestException(
        `Delivery ${deliveryId} has no providerOrderCode — create the GHN order first`,
      );
    }

    // Force always applies: bump timestamp past lastStatusAt so the stale guard passes.
    const occurredAt = new Date(
      Math.max(Date.now(), (delivery.lastStatusAt?.getTime() ?? 0) + 1000),
    );

    return this.deliveryService.applyProviderStatus({
      delivery,
      providerStatus,
      occurredAt,
      rawPayload: {
        simulated: true,
        forced: true,
        providerStatus,
        note: note ?? null,
        at: occurredAt.toISOString(),
      },
    });
  }

  private async claimDue(options: {
    ignoreDelay: boolean;
    deliveryId?: string;
    limit: number;
  }): Promise<Delivery[]> {
    const isPg = this.isPostgres();

    const runClaim = async (manager: EntityManager) => {
      const qb = manager
        .createQueryBuilder(Delivery, 'd')
        .innerJoin('d.order', 'order')
        .where('d.providerOrderCode IS NOT NULL')
        .andWhere('d.status NOT IN (:...terminal)', {
          terminal: [...TERMINAL_DELIVERY_STATUSES],
        })
        .andWhere('order.status NOT IN (:...blocked)', {
          blocked: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
        })
        .orderBy('d.lastStatusAt', 'ASC', 'NULLS FIRST')
        .take(options.limit);

      if (!options.ignoreDelay) {
        const cutoff = new Date(
          Date.now() - this.config.deliverySimulationConfig.stepDelaySec * 1000,
        );
        qb.andWhere('(d.lastStatusAt IS NULL OR d.lastStatusAt <= :cutoff)', {
          cutoff,
        });
      }
      if (options.deliveryId) {
        qb.andWhere('d.id = :id', { id: options.deliveryId });
      }

      if (isPg) {
        // Lock only the delivery row — avoid FOR UPDATE on the joined order.
        qb.setLock('pessimistic_write', undefined, ['d']).setOnLocked(
          'skip_locked',
        );
      }

      const rows = await qb.getMany();
      return rows.filter(
        (row) => nextSimulatedStatus(row.providerStatus) !== null,
      );
    };

    if (isPg) {
      return this.dataSource.transaction((manager) => runClaim(manager));
    }
    return runClaim(this.deliveryRepository.manager);
  }

  private async advanceSafely(
    delivery: Delivery,
    stepOffset: number,
  ): Promise<DeliveryTickTransition | null> {
    const nextStatus = nextSimulatedStatus(delivery.providerStatus);
    if (!nextStatus) {
      return null;
    }

    // Staff handover is the only path to `picked`. Park at `picking` until confirmed.
    if (nextStatus === 'picked' && !delivery.handedOverAt) {
      return null;
    }

    try {
      // Space multi-step advances 1s apart so the stale guard stays happy.
      const base = Math.max(
        Date.now(),
        (delivery.lastStatusAt?.getTime() ?? 0) + 1000,
      );
      const occurredAt = new Date(base + stepOffset * 1000);

      const result = await this.deliveryService.applyProviderStatus({
        delivery,
        providerStatus: nextStatus,
        occurredAt,
        rawPayload: {
          simulated: true,
          providerStatus: nextStatus,
          at: occurredAt.toISOString(),
        },
      });

      if (!result.applied) {
        return null;
      }

      return {
        deliveryId: delivery.id,
        orderId: delivery.orderId,
        providerStatus: nextStatus,
        deliveryStatus: result.deliveryStatus,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to advance delivery ${delivery.id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  private isPostgres(): boolean {
    return (
      this.deliveryRepository.manager.connection?.driver?.options?.type ===
      'postgres'
    );
  }
}
