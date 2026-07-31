import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { DeliveryProvider } from '../delivery/delivery-provider.entity';
import { Delivery } from '../delivery/delivery.entity';
import { DeliveryService } from '../delivery/delivery.service';
import { DeliveryStatus } from '../delivery/enums';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { SurveyRecommendationItem } from '../recommendations/survey-recommendation-item.entity';
import { Customer } from '../users/customer.entity';
import { CreateOrderDto } from './dto/create-order.dto';
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

/** Mirrors RecommendationService's private helper so mocks match real combo behavior. */
function getItemVariantIds(item: SurveyRecommendationItem): string[] {
  const ranked = (item.rankedVariants ?? []).map((v) => v.productVariantId);
  if (ranked.length > 0) return ranked;
  return item.productVariantId ? [item.productVariantId] : [];
}

describe('OrdersService', () => {
  let service: OrdersService;
  let cartService: jest.Mocked<
    Pick<CartService, 'getCartByCustomerId' | 'clearCartByCustomerId'>
  >;
  let recommendationService: jest.Mocked<
    Pick<
      RecommendationService,
      | 'getByIdForCustomer'
      | 'getAllowedVariantIds'
      | 'isProtocolCoverageComplete'
      | 'findItemIdForVariant'
    >
  >;
  let settingRepository: { findOneBy: jest.Mock };
  let variantRepository: { find: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let orderRepository: { findOne: jest.Mock };
  let deliveryProviderRepository: { findOneBy: jest.Mock };
  let deliveryService: jest.Mocked<Pick<DeliveryService, 'quoteFee'>>;
  let savedOrders: Order[];
  let savedDeliveries: Delivery[];

  const customer = { id: 'cust-1', userId: 'user-1' } as Customer;
  const variants = [
    { id: 'v1', priceVnd: 100000, weightGram: 200, isActive: true },
    { id: 'v2', priceVnd: 200000, weightGram: 150, isActive: true },
  ] as ProductVariant[];

  const DTO: CreateOrderDto = {
    shippingAddress: {
      recipientName: 'Nguyen Van A',
      recipientPhone: '0901234567',
      provinceId: 202,
      districtId: 1449,
      wardCode: '21211',
      streetAddress: '123 Le Loi',
    },
  };

  const deliveryFixture = {
    provinceId: 202,
    districtId: 1449,
    wardCode: '21211',
  };

  beforeEach(async () => {
    savedOrders = [];
    savedDeliveries = [];
    cartService = {
      getCartByCustomerId: jest.fn(),
      clearCartByCustomerId: jest.fn().mockResolvedValue(undefined),
    };
    recommendationService = {
      getByIdForCustomer: jest.fn(),
      getAllowedVariantIds: jest.fn((recommendation) => {
        const ids = new Set<string>();
        for (const item of recommendation.items ?? []) {
          for (const id of getItemVariantIds(item)) ids.add(id);
        }
        return [...ids];
      }),
      isProtocolCoverageComplete: jest.fn((recommendation, cartVariantIds) => {
        const cartSet = new Set(cartVariantIds);
        const items = recommendation.items ?? [];
        if (items.length === 0) return false;
        return items.every((item) =>
          getItemVariantIds(item).some((id) => cartSet.has(id)),
        );
      }),
      findItemIdForVariant: jest.fn((recommendation, productVariantId) => {
        for (const item of recommendation.items ?? []) {
          if (getItemVariantIds(item).includes(productVariantId)) {
            return item.id;
          }
        }
        return null;
      }),
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
    deliveryProviderRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'prov-ghn', code: 'GHN' }),
    };
    deliveryService = {
      quoteFee: jest.fn().mockResolvedValue(32000),
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
            // Route by discriminating field: Order has customerId, Delivery has providerId.
            if ((value as Order).customerId) {
              savedOrders.push(value as Order);
            } else if ((value as unknown as Delivery).providerId) {
              savedDeliveries.push(value as unknown as Delivery);
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
        {
          provide: getRepositoryToken(DeliveryProvider),
          useValue: deliveryProviderRepository,
        },
        { provide: CartService, useValue: cartService },
        { provide: RecommendationService, useValue: recommendationService },
        { provide: DeliveryService, useValue: deliveryService },
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
      shippingFeeVnd: 32000,
      totalVnd: 302000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    const order = await service.createFromCart('user-1', DTO);
    expect(savedOrders[0].discountType).toBe(OrderDiscountType.COMBO);
    expect(savedOrders[0].discountVnd).toBe(30000);
    // 300000 - 30000 + 32000 shipping
    expect(savedOrders[0].totalVnd).toBe(302000);
    expect(order.totalVnd).toBe(302000);
    expect(order.provinceId).toBe(202);
    expect(order.districtId).toBe(1449);
    expect(order.wardCode).toBe('21211');
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
      shippingFeeVnd: 32000,
      totalVnd: 132000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    await service.createFromCart('user-1', DTO);
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
      shippingFeeVnd: 32000,
      totalVnd: 232000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    await service.createFromCart('user-1', DTO);
    expect(savedOrders[0].source).toBe(OrderSource.CATALOG);
    expect(savedOrders[0].shippingFeeVnd).toBe(32000);
    expect(recommendationService.getByIdForCustomer).not.toHaveBeenCalled();
  });

  it('rejects empty carts', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: null,
      surveyRecommendationId: null,
      items: [],
    });
    await expect(service.createFromCart('user-1', DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects users without a customer profile', async () => {
    customerRepository.findOne.mockResolvedValue(null);
    await expect(service.createFromCart('user-1', DTO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('adds the GHN shipping fee to the order total', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.CATALOG,
      customerSurveyId: null,
      surveyRecommendationId: null,
      subtotalVnd: 100000,
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 32000,
      totalVnd: 132000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    const order = await service.createFromCart('user-1', DTO);

    expect(savedOrders[0].subtotalVnd).toBe(100000);
    expect(savedOrders[0].shippingFeeVnd).toBe(32000);
    expect(savedOrders[0].totalVnd).toBe(132000);
    expect(order.shippingFeeVnd).toBe(32000);
    expect(order.provinceId).toBe(202);
    expect(order.districtId).toBe(1449);
    expect(order.wardCode).toBe('21211');
    // Weights come from the variants, not the cart.
    expect(deliveryService.quoteFee).toHaveBeenCalledWith(DTO.shippingAddress, [
      { weightGram: 200, quantity: 1 },
    ]);
  });

  it('creates a PENDING delivery holding the structured address', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.CATALOG,
      customerSurveyId: null,
      surveyRecommendationId: null,
      subtotalVnd: 100000,
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 32000,
      totalVnd: 132000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    await service.createFromCart('user-1', DTO);

    expect(savedDeliveries).toHaveLength(1);
    expect(savedDeliveries[0]).toMatchObject({
      providerId: 'prov-ghn',
      status: DeliveryStatus.PENDING,
      districtId: 1449,
      wardCode: '21211',
      recipientPhone: '0901234567',
      shippingFeeVnd: 32000,
    });
    // No GHN order exists until payment succeeds.
    expect(savedDeliveries[0].providerOrderCode).toBeUndefined();
  });

  it('returns null address IDs when delivery is missing', async () => {
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.CATALOG,
      customerSurveyId: null,
      surveyRecommendationId: null,
      subtotalVnd: 100000,
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 0,
      totalVnd: 100000,
      items: [],
      createdAt: new Date(),
    });

    const order = await service.getOrderForUser('user-1', 'order-1');
    expect(order.provinceId).toBeNull();
    expect(order.districtId).toBeNull();
    expect(order.wardCode).toBeNull();
  });

  it('rejects when the GHN provider row is missing', async () => {
    deliveryProviderRepository.findOneBy.mockResolvedValue(null);
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });

    await expect(service.createFromCart('user-1', DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deliveryService.quoteFee).not.toHaveBeenCalled();
  });
});
