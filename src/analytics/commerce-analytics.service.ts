import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { Order } from '../commerce/order.entity';
import { Customer } from '../users/customer.entity';
import { CommerceAnalyticsEvent } from './commerce-analytics-event.entity';
import { CommerceAnalyticsEventType } from './commerce-analytics.enums';
import { CommerceAnalyticsBatchDto } from './dto/commerce-analytics.dto';

const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 90;

@Injectable()
export class CommerceAnalyticsService {
  constructor(
    @InjectRepository(CommerceAnalyticsEvent)
    private readonly eventRepository: Repository<CommerceAnalyticsEvent>,
  ) {}

  async ingestBatch(
    dto: CommerceAnalyticsBatchDto,
    userId: string | null,
  ): Promise<number> {
    const now = Date.now();
    const events = dto.events.map((event) => {
      const occurredAt = new Date(event.occurredAt);
      const timestamp = occurredAt.getTime();
      if (
        timestamp < now - MAX_EVENT_AGE_MS ||
        timestamp > now + MAX_FUTURE_SKEW_MS
      ) {
        throw new BadRequestException(
          'Analytics occurredAt must be within the last 24 hours',
        );
      }
      return this.eventRepository.create({
        id: event.eventId,
        sessionId: event.sessionId,
        userId,
        eventType: event.eventType as unknown as CommerceAnalyticsEventType,
        source: event.source,
        productId: event.productId ?? null,
        productVariantId: event.productVariantId ?? null,
        orderId: null,
        path: event.path?.trim() || null,
        occurredAt,
      });
    });

    const result = await this.eventRepository
      .createQueryBuilder()
      .insert()
      .into(CommerceAnalyticsEvent)
      .values(events)
      .orIgnore()
      .execute();
    return result.identifiers.length;
  }

  async recordPurchaseWithManager(
    manager: EntityManager,
    orderId: string,
    occurredAt: Date,
  ): Promise<void> {
    const order = await manager.findOne(Order, { where: { id: orderId } });
    if (!order?.analyticsSessionId) return;

    const customer = await manager.findOne(Customer, {
      where: { id: order.customerId },
    });
    await manager
      .createQueryBuilder()
      .insert()
      .into(CommerceAnalyticsEvent)
      .values({
        id: randomUUID(),
        sessionId: order.analyticsSessionId,
        userId: customer?.userId ?? null,
        eventType: CommerceAnalyticsEventType.PURCHASE_COMPLETED,
        source: order.source,
        productId: null,
        productVariantId: null,
        orderId,
        path: null,
        occurredAt,
      })
      .orIgnore()
      .execute();
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async purgeExpiredEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.eventRepository.delete({ occurredAt: LessThan(cutoff) });
  }
}
