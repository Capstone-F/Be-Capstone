import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderSource } from '../commerce/enums';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { ConflictSeverity } from '../products/enums/conflict-severity.enum';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { StockService } from '../stock/stock.service';
import { Customer } from '../users/customer.entity';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  let redisStore: Map<string, string>;
  let recommendationService: {
    getByIdForCustomer: jest.Mock;
  };
  let variantRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let productProtocolRepository: {
    find: jest.Mock;
  };
  let ingredientConflictRepository: {
    find: jest.Mock;
  };
  let stockService: { getAvailableQuantity: jest.Mock };

  beforeEach(async () => {
    redisStore = new Map();
    recommendationService = {
      getByIdForCustomer: jest.fn().mockResolvedValue({
        id: 'rec-1',
        items: [{ productVariantId: 'v1' }, { productVariantId: 'v2' }],
      }),
    };
    variantRepository = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve({
            id: where.id,
            productId: `product-${where.id}`,
            isActive: true,
          }),
        ),
      find: jest.fn().mockResolvedValue([]),
    };
    productProtocolRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    ingredientConflictRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    stockService = {
      getAvailableQuantity: jest.fn().mockResolvedValue(100),
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
          useValue: variantRepository,
        },
        {
          provide: getRepositoryToken(ProductProtocol),
          useValue: productProtocolRepository,
        },
        {
          provide: getRepositoryToken(IngredientConflict),
          useValue: ingredientConflictRepository,
        },
        { provide: RecommendationService, useValue: recommendationService },
        { provide: StockService, useValue: stockService },
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
    expect(cart.conflicts).toEqual([]);
  });

  it('rejects adding an out-of-stock variant', async () => {
    stockService.getAvailableQuantity.mockResolvedValue(0);

    await expect(
      service.addItem('u1', {
        productVariantId: 'v1',
        quantity: 1,
        source: OrderSource.CATALOG,
      }),
    ).rejects.toThrow('Sản phẩm đã hết hàng');

    const cart = await service.getCart('u1');
    expect(cart.items).toHaveLength(0);
  });

  it('rejects a quantity above the available stock', async () => {
    stockService.getAvailableQuantity.mockResolvedValue(3);

    await expect(
      service.addItem('u1', {
        productVariantId: 'v1',
        quantity: 5,
        source: OrderSource.CATALOG,
      }),
    ).rejects.toThrow('Không đủ hàng tồn kho: còn 3, yêu cầu 5');
  });

  it('allows adding when stock covers the requested quantity', async () => {
    stockService.getAvailableQuantity.mockResolvedValue(3);

    const cart = await service.addItem('u1', {
      productVariantId: 'v1',
      quantity: 3,
      source: OrderSource.CATALOG,
    });
    expect(cart.items).toEqual([{ productVariantId: 'v1', quantity: 3 }]);
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
    expect(cleared.conflicts).toEqual([]);
  });

  it('returns empty conflicts for an empty cart', async () => {
    const cart = await service.getCart('u1');
    expect(cart).toEqual({
      source: null,
      surveyRecommendationId: null,
      items: [],
      conflicts: [],
    });
    expect(variantRepository.find).not.toHaveBeenCalled();
  });

  it('returns empty conflicts when cart products have no overlapping conflict protocols', async () => {
    variantRepository.find.mockResolvedValue([{ id: 'v1', productId: 'p1' }]);
    productProtocolRepository.find.mockResolvedValue([
      {
        productId: 'p1',
        protocolId: 'proto-1',
        protocol: { code: 'salicylic_acne' },
      },
    ]);
    ingredientConflictRepository.find.mockResolvedValue([]);

    const cart = await service.addItem('u1', {
      productVariantId: 'v1',
      quantity: 1,
      source: OrderSource.CATALOG,
    });

    expect(cart.conflicts).toEqual([]);
  });

  it('returns protocol conflicts with Vietnamese description and variant ids', async () => {
    variantRepository.find.mockResolvedValue([
      { id: 'v-retinol', productId: 'p-retinol' },
      { id: 'v-aha', productId: 'p-aha' },
    ]);
    productProtocolRepository.find.mockResolvedValue([
      {
        productId: 'p-retinol',
        protocolId: 'proto-retinol',
        protocol: { code: 'retinol_0.3_anti_aging' },
      },
      {
        productId: 'p-aha',
        protocolId: 'proto-aha',
        protocol: { code: 'glycolic_exfoliation' },
      },
    ]);
    ingredientConflictRepository.find.mockResolvedValue([
      {
        protocolId: 'proto-retinol',
        conflictingProtocolId: 'proto-aha',
        severity: ConflictSeverity.HIGH,
        reason: 'Retinol + AHA may cause excessive irritation',
        description: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
        protocol: { code: 'retinol_0.3_anti_aging' },
        conflictingProtocol: { code: 'glycolic_exfoliation' },
      },
    ]);

    await service.addItem('u1', {
      productVariantId: 'v-retinol',
      quantity: 1,
      source: OrderSource.CATALOG,
    });
    const cart = await service.addItem('u1', {
      productVariantId: 'v-aha',
      quantity: 1,
      source: OrderSource.CATALOG,
    });

    expect(cart.conflicts).toEqual([
      {
        protocolCode: 'retinol_0.3_anti_aging',
        conflictingProtocolCode: 'glycolic_exfoliation',
        severity: ConflictSeverity.HIGH,
        description: 'Retinol kết hợp AHA có thể gây kích ứng mạnh',
        reason: 'Retinol + AHA may cause excessive irritation',
        productVariantIds: ['v-retinol'],
        conflictingProductVariantIds: ['v-aha'],
      },
    ]);
  });

  it('falls back to English reason when Vietnamese description is missing', async () => {
    variantRepository.find.mockResolvedValue([
      { id: 'v-retinol', productId: 'p-retinol' },
      { id: 'v-bha', productId: 'p-bha' },
    ]);
    productProtocolRepository.find.mockResolvedValue([
      {
        productId: 'p-retinol',
        protocolId: 'proto-retinol',
        protocol: { code: 'retinol_0.3_anti_aging' },
      },
      {
        productId: 'p-bha',
        protocolId: 'proto-bha',
        protocol: { code: 'salicylic_acne' },
      },
    ]);
    ingredientConflictRepository.find.mockResolvedValue([
      {
        protocolId: 'proto-retinol',
        conflictingProtocolId: 'proto-bha',
        severity: ConflictSeverity.MEDIUM,
        reason: 'Combining retinol with BHA may increase dryness',
        description: null,
        protocol: { code: 'retinol_0.3_anti_aging' },
        conflictingProtocol: { code: 'salicylic_acne' },
      },
    ]);

    await service.addItem('u1', {
      productVariantId: 'v-retinol',
      quantity: 1,
      source: OrderSource.CATALOG,
    });
    const cart = await service.addItem('u1', {
      productVariantId: 'v-bha',
      quantity: 1,
      source: OrderSource.CATALOG,
    });

    expect(cart.conflicts[0].description).toBe(
      'Combining retinol with BHA may increase dryness',
    );
  });
});
