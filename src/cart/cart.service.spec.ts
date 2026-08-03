import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { OrderSource } from '../commerce/enums';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { Customer } from '../users/customer.entity';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  let redisStore: Map<string, string>;
  let recommendationService: {
    getByIdForCustomer: jest.Mock;
  };

  beforeEach(async () => {
    redisStore = new Map();
    recommendationService = {
      getByIdForCustomer: jest.fn().mockResolvedValue({
        id: 'rec-1',
        items: [{ productVariantId: 'v1' }, { productVariantId: 'v2' }],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: REDIS_CLIENT,
          useValue: {
            get: (key: string) => Promise.resolve(redisStore.get(key) ?? null),
            set: (key: string, value: string) => {
              redisStore.set(key, value);
              return Promise.resolve('OK');
            },
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue({ id: 'cust-1', userId: 'u1' }),
          },
        },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: {
            findOne: jest
              .fn()
              .mockImplementation(({ where }: { where: { id: string } }) =>
                Promise.resolve({ id: where.id, isActive: true }),
              ),
          },
        },
        { provide: RecommendationService, useValue: recommendationService },
      ],
    }).compile();

    service = module.get(CartService);
  });

  it('isolates SURVEY and CATALOG sources', async () => {
    await service.addItem('u1', {
      productVariantId: 'v1',
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
    });

    await expect(
      service.addItem('u1', {
        productVariantId: 'v-catalog',
        quantity: 1,
        source: OrderSource.CATALOG,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows survey cart items outside the recommendation', async () => {
    const cart = await service.addItem('u1', {
      productVariantId: 'v-other',
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
    });
    expect(cart.source).toBe(OrderSource.SURVEY);
    expect(cart.surveyRecommendationId).toBe('rec-1');
    expect(cart.items).toEqual([{ productVariantId: 'v-other', quantity: 1 }]);
  });

  it('clears source when cart is emptied', async () => {
    await service.addItem('u1', {
      productVariantId: 'v1',
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
    });
    const cleared = await service.removeItem('u1', 'v1');
    expect(cleared.source).toBeNull();
    expect(cleared.items).toHaveLength(0);
  });
});
