import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { Customer } from '../users/customer.entity';
import { CommerceSetting } from './commerce-setting.entity';
import {
  CommerceSettingKey,
  OrderDiscountType,
  OrderSource,
  OrderStatus,
} from './enums';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let cartService: jest.Mocked<
    Pick<CartService, 'getCartByCustomerId' | 'clearCartByCustomerId'>
  >;
  let recommendationService: jest.Mocked<
    Pick<RecommendationService, 'getByIdForCustomer'>
  >;
  let settingRepository: { findOneBy: jest.Mock };
  let variantRepository: { find: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let orderRepository: { findOne: jest.Mock };
  let savedOrders: Order[];

  const customer = { id: 'cust-1', userId: 'user-1' } as Customer;
  const variants = [
    { id: 'v1', priceVnd: 100000, isActive: true },
    { id: 'v2', priceVnd: 200000, isActive: true },
  ] as ProductVariant[];

  beforeEach(async () => {
    savedOrders = [];
    cartService = {
      getCartByCustomerId: jest.fn(),
      clearCartByCustomerId: jest.fn().mockResolvedValue(undefined),
    };
    recommendationService = {
      getByIdForCustomer: jest.fn(),
    };
    settingRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
        value: '10',
      }),
    };
    variantRepository = {
      find: jest.fn().mockImplementation((opts: { where: { id: unknown } }) => {
        const op = opts.where.id as {
          value?: string[];
          _value?: string[];
        };
        const ids = op?.value ?? op?._value ?? [];
        return Promise.resolve(variants.filter((v) => ids.includes(v.id)));
      }),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };
    orderRepository = {
      findOne: jest.fn(),
    };

    const dataSource = {
      transaction: async (cb: (m: unknown) => Promise<Order>) =>
        cb({
          create: (_entity: unknown, data: Partial<Order | OrderItem>) =>
            ({ ...data }) as Order,
          save: async (value: Order | OrderItem | Array<Order | OrderItem>) => {
            if (Array.isArray(value)) {
              return value;
            }
            if (!(value as Order).id) {
              (value as Order).id = `order-${savedOrders.length + 1}`;
            }
            if ((value as Order).customerId) {
              savedOrders.push(value as Order);
            }
            return value;
          },
        }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: variantRepository,
        },
        {
          provide: getRepositoryToken(CommerceSetting),
          useValue: settingRepository,
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepository,
        },
        { provide: CartService, useValue: cartService },
        { provide: RecommendationService, useValue: recommendationService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('applies combo discount when all recommended variants are in the cart', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
      items: [
        { productVariantId: 'v1', quantity: 1 },
        { productVariantId: 'v2', quantity: 1 },
      ],
    });
    recommendationService.getByIdForCustomer.mockResolvedValue({
      id: 'rec-1',
      customerSurveyId: 'survey-1',
      items: [
        { id: 'ri-1', productVariantId: 'v1' },
        { id: 'ri-2', productVariantId: 'v2' },
      ],
    } as SurveyRecommendation);

    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.SURVEY,
      customerSurveyId: 'survey-1',
      surveyRecommendationId: 'rec-1',
      subtotalVnd: 300000,
      discountVnd: 30000,
      discountType: OrderDiscountType.COMBO,
      totalVnd: 270000,
      items: [],
      createdAt: new Date(),
    });

    const order = await service.createFromCart('user-1');
    expect(savedOrders[0].discountType).toBe(OrderDiscountType.COMBO);
    expect(savedOrders[0].discountVnd).toBe(30000);
    expect(savedOrders[0].totalVnd).toBe(270000);
    expect(order.totalVnd).toBe(270000);
    expect(cartService.clearCartByCustomerId).toHaveBeenCalledWith('cust-1');
  });

  it('skips combo discount for partial survey carts', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });
    recommendationService.getByIdForCustomer.mockResolvedValue({
      id: 'rec-1',
      customerSurveyId: 'survey-1',
      items: [
        { id: 'ri-1', productVariantId: 'v1' },
        { id: 'ri-2', productVariantId: 'v2' },
      ],
    } as SurveyRecommendation);
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.SURVEY,
      customerSurveyId: 'survey-1',
      surveyRecommendationId: 'rec-1',
      subtotalVnd: 100000,
      discountVnd: 0,
      discountType: null,
      totalVnd: 100000,
      items: [],
      createdAt: new Date(),
    });

    await service.createFromCart('user-1');
    expect(savedOrders[0].discountVnd).toBe(0);
    expect(savedOrders[0].discountType).toBeNull();
  });

  it('creates catalog orders without recommendation linkage', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      items: [{ productVariantId: 'v1', quantity: 2 }],
    });
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.CATALOG,
      customerSurveyId: null,
      surveyRecommendationId: null,
      subtotalVnd: 200000,
      discountVnd: 0,
      discountType: null,
      totalVnd: 200000,
      items: [],
      createdAt: new Date(),
    });

    await service.createFromCart('user-1');
    expect(savedOrders[0].source).toBe(OrderSource.CATALOG);
    expect(recommendationService.getByIdForCustomer).not.toHaveBeenCalled();
  });

  it('rejects empty carts', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: null,
      surveyRecommendationId: null,
      items: [],
    });
    await expect(service.createFromCart('user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects users without a customer profile', async () => {
    customerRepository.findOne.mockResolvedValue(null);
    await expect(service.createFromCart('user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
