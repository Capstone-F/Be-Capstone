import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Order } from '../commerce/order.entity';
import { OrderSource } from '../commerce/enums';
import { Customer } from '../users/customer.entity';
import { CommerceAnalyticsEvent } from './commerce-analytics-event.entity';
import { CommerceAnalyticsService } from './commerce-analytics.service';
import { ClientCommerceAnalyticsEventType } from './commerce-analytics.enums';

describe('CommerceAnalyticsService', () => {
  const insertExecute = jest
    .fn()
    .mockResolvedValue({ identifiers: [{ id: '1' }] });
  const insertBuilder = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    execute: insertExecute,
  };
  Object.values(insertBuilder).forEach((fn) => {
    if (typeof fn === 'function' && fn !== insertExecute) {
      fn.mockReturnValue(insertBuilder);
    }
  });
  const repository = {
    create: jest.fn((value) => value),
    createQueryBuilder: jest.fn(() => insertBuilder),
    delete: jest.fn(),
  } as unknown as Repository<CommerceAnalyticsEvent>;
  const service = new CommerceAnalyticsService(repository);

  it('ingests allowed client events idempotently', async () => {
    const accepted = await service.ingestBatch(
      {
        events: [
          {
            eventId: '11111111-1111-4111-8111-111111111111',
            sessionId: '22222222-2222-4222-8222-222222222222',
            eventType: ClientCommerceAnalyticsEventType.PRODUCT_VIEWED,
            source: OrderSource.CATALOG,
            occurredAt: new Date().toISOString(),
          },
        ],
      },
      null,
    );

    expect(accepted).toBe(1);
    expect(insertBuilder.orIgnore).toHaveBeenCalled();
  });

  it('rejects stale client timestamps', async () => {
    await expect(
      service.ingestBatch(
        {
          events: [
            {
              eventId: '11111111-1111-4111-8111-111111111111',
              sessionId: '22222222-2222-4222-8222-222222222222',
              eventType: ClientCommerceAnalyticsEventType.ADDED_TO_CART,
              source: OrderSource.CATALOG,
              occurredAt: new Date(
                Date.now() - 25 * 60 * 60 * 1000,
              ).toISOString(),
            },
          ],
        },
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a paid purchase once using the order session', async () => {
    const purchaseExecute = jest.fn().mockResolvedValue({ identifiers: [] });
    const purchaseBuilder = {
      insert: jest.fn(),
      into: jest.fn(),
      values: jest.fn(),
      orIgnore: jest.fn(),
      execute: purchaseExecute,
    };
    Object.values(purchaseBuilder).forEach((fn) => {
      if (typeof fn === 'function' && fn !== purchaseExecute) {
        fn.mockReturnValue(purchaseBuilder);
      }
    });
    const manager = {
      findOne: jest.fn().mockImplementation((entity: unknown) =>
        entity === Order
          ? Promise.resolve({
              id: 'order-1',
              customerId: 'customer-1',
              source: OrderSource.SURVEY,
              analyticsSessionId: '22222222-2222-4222-8222-222222222222',
            })
          : entity === Customer
            ? Promise.resolve({ userId: 'user-1' })
            : Promise.resolve(null),
      ),
      createQueryBuilder: jest.fn(() => purchaseBuilder),
    };

    await service.recordPurchaseWithManager(
      manager as never,
      'order-1',
      new Date('2026-08-13T02:00:00.000Z'),
    );

    expect(purchaseBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        userId: 'user-1',
        source: OrderSource.SURVEY,
      }),
    );
    expect(purchaseBuilder.orIgnore).toHaveBeenCalled();
  });

  it('purges analytics older than ninety days', async () => {
    await service.purgeExpiredEvents();
    expect(repository.delete).toHaveBeenCalledWith({
      occurredAt: expect.any(Object),
    });
  });
});
