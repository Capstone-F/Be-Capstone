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
import { StockService } from '../stock/stock.service';
import { TreatmentStatus } from '../treatments/enums';
import { TreatmentPhase } from '../treatments/treatment-phase.entity';
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

/** Mirrors RecommendationService helpers so mocks match real linkage behavior. */
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
      'getByIdForCustomer' | 'getAllowedVariantIds' | 'findItemIdForVariant'
    >
  >;
  let settingRepository: { findOneBy: jest.Mock };
  let variantRepository: { find: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let orderRepository: { findOne: jest.Mock; update: jest.Mock };
  let deliveryProviderRepository: { findOneBy: jest.Mock };
  let deliveryService: jest.Mocked<
    Pick<DeliveryService, 'quoteFee' | 'createGhnOrderForPaidOrder'>
  >;
  let stockService: {
    getAvailableQuantities: jest.Mock;
    deductByVariantId: jest.Mock;
  };
  let orderItemRepository: { update: jest.Mock };
  let treatmentPhaseRepository: { findOne: jest.Mock };
  let savedOrders: Order[];
  let savedDeliveries: Delivery[];
  let savedOrderItems: OrderItem[];

  const customer = { id: 'cust-1', userId: 'user-1' } as Customer;
  const variants = [
    { id: 'v1', priceVnd: 100000, weightGram: 200, isActive: true },
    { id: 'v2', priceVnd: 200000, weightGram: 150, isActive: true },
    { id: 'v-extra', priceVnd: 150000, weightGram: 100, isActive: true },
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
    savedOrderItems = [];
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
      findOneBy: jest
        .fn()
        .mockImplementation(({ key }: { key: CommerceSettingKey }) => {
          if (key === CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT) {
            return Promise.resolve({
              key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
              value: '10',
            });
          }
          if (key === CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND) {
            return Promise.resolve({
              key: CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
              value: '300000',
            });
          }
          return Promise.resolve(null);
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
      update: jest.fn(),
    };
    deliveryProviderRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'prov-ghn', code: 'GHN' }),
    };
    deliveryService = {
      quoteFee: jest.fn().mockResolvedValue(32000),
      createGhnOrderForPaidOrder: jest.fn().mockResolvedValue(undefined),
    };
    stockService = {
      getAvailableQuantities: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 100]))),
        ),
      deductByVariantId: jest.fn().mockResolvedValue({}),
    };
    orderItemRepository = { update: jest.fn() };
    treatmentPhaseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'phase-1',
        treatment: {
          id: 'treatment-1',
          customerId: 'cust-1',
          paidAt: new Date('2026-08-01T00:00:00Z'),
          status: TreatmentStatus.ACTIVE,
        },
      }),
    };

    const dataSource = {
      transaction: async (cb: (m: unknown) => Promise<Order>) =>
        cb({
          create: (_entity: unknown, data: Partial<Order | OrderItem>) =>
            ({ ...data }) as Order,
          save: async (value: Order | OrderItem | Array<Order | OrderItem>) => {
            if (Array.isArray(value)) {
              savedOrderItems.push(...(value as OrderItem[]));
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
        {
          provide: getRepositoryToken(OrderItem),
          useValue: orderItemRepository,
        },
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
        {
          provide: getRepositoryToken(TreatmentPhase),
          useValue: treatmentPhaseRepository,
        },
        { provide: CartService, useValue: cartService },
        { provide: RecommendationService, useValue: recommendationService },
        { provide: DeliveryService, useValue: deliveryService },
        { provide: StockService, useValue: stockService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('applies combo discount when subtotal exceeds the minimum threshold', async () => {
    // v1 + v2 + v-extra = 450000 > 300000
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
      treatmentPhaseId: null,
      items: [
        { productVariantId: 'v1', quantity: 1 },
        { productVariantId: 'v2', quantity: 1 },
        { productVariantId: 'v-extra', quantity: 1 },
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
      subtotalVnd: 450000,
      discountVnd: 45000,
      discountType: OrderDiscountType.COMBO,
      shippingFeeVnd: 32000,
      totalVnd: 437000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    const order = await service.createFromCart('user-1', DTO);
    expect(savedOrders[0].discountType).toBe(OrderDiscountType.COMBO);
    expect(savedOrders[0].discountVnd).toBe(45000);
    // 450000 - 45000 + 32000 shipping
    expect(savedOrders[0].totalVnd).toBe(437000);
    expect(order.totalVnd).toBe(437000);
    expect(order.provinceId).toBe(202);
    expect(order.districtId).toBe(1449);
    expect(order.wardCode).toBe('21211');
    expect(cartService.clearCartByCustomerId).toHaveBeenCalledWith('cust-1');
    expect(savedOrderItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productVariantId: 'v1',
          surveyRecommendationItemId: 'ri-1',
        }),
        expect.objectContaining({
          productVariantId: 'v2',
          surveyRecommendationItemId: 'ri-2',
        }),
        expect.objectContaining({
          productVariantId: 'v-extra',
          surveyRecommendationItemId: null,
        }),
      ]),
    );
  });

  it('skips combo discount when subtotal does not exceed the threshold', async () => {
    // v1 + v2 = 300000, not > 300000
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
      treatmentPhaseId: null,
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
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 32000,
      totalVnd: 332000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    await service.createFromCart('user-1', DTO);
    expect(savedOrders[0].discountVnd).toBe(0);
    expect(savedOrders[0].discountType).toBeNull();
  });

  describe('TREATMENT orders', () => {
    const treatmentOrderRow = {
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.TREATMENT,
      customerSurveyId: null,
      surveyRecommendationId: null,
      treatmentPhaseId: 'phase-1',
      subtotalVnd: 450000,
      discountVnd: 45000,
      discountType: OrderDiscountType.COMBO,
      shippingFeeVnd: 32000,
      totalVnd: 437000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    };

    it('applies treatment combo discount above the threshold and links the phase', async () => {
      settingRepository.findOneBy.mockImplementation(
        ({ key }: { key: CommerceSettingKey }) => {
          if (key === CommerceSettingKey.TREATMENT_COMBO_DISCOUNT_PCT) {
            return Promise.resolve({ key, value: '10' });
          }
          if (key === CommerceSettingKey.TREATMENT_COMBO_MIN_SUBTOTAL_VND) {
            return Promise.resolve({ key, value: '300000' });
          }
          return Promise.resolve(null);
        },
      );
      // v1 + v2 + v-extra = 450000 > 300000
      cartService.getCartByCustomerId.mockResolvedValue({
        source: OrderSource.TREATMENT,
        surveyRecommendationId: null,
        treatmentPhaseId: 'phase-1',
        items: [
          { productVariantId: 'v1', quantity: 1 },
          { productVariantId: 'v2', quantity: 1 },
          { productVariantId: 'v-extra', quantity: 1 },
        ],
      });
      orderRepository.findOne.mockResolvedValue(treatmentOrderRow);

      const order = await service.createFromCart('user-1', DTO);
      expect(savedOrders[0].source).toBe(OrderSource.TREATMENT);
      expect(savedOrders[0].treatmentPhaseId).toBe('phase-1');
      expect(savedOrders[0].discountType).toBe(OrderDiscountType.COMBO);
      expect(savedOrders[0].discountVnd).toBe(45000);
      expect(savedOrders[0].totalVnd).toBe(437000);
      expect(order.treatmentPhaseId).toBe('phase-1');
      expect(recommendationService.getByIdForCustomer).not.toHaveBeenCalled();
    });

    it('skips the discount when subtotal does not exceed the threshold', async () => {
      // v1 + v2 = 300000, not > 300000
      cartService.getCartByCustomerId.mockResolvedValue({
        source: OrderSource.TREATMENT,
        surveyRecommendationId: null,
        treatmentPhaseId: 'phase-1',
        items: [
          { productVariantId: 'v1', quantity: 1 },
          { productVariantId: 'v2', quantity: 1 },
        ],
      });
      orderRepository.findOne.mockResolvedValue({
        ...treatmentOrderRow,
        subtotalVnd: 300000,
        discountVnd: 0,
        discountType: null,
        totalVnd: 332000,
      });

      await service.createFromCart('user-1', DTO);
      expect(savedOrders[0].discountVnd).toBe(0);
      expect(savedOrders[0].discountType).toBeNull();
    });

    it('rejects when the treatment phase is not paid', async () => {
      treatmentPhaseRepository.findOne.mockResolvedValue({
        id: 'phase-1',
        treatment: {
          customerId: 'cust-1',
          paidAt: null,
          status: TreatmentStatus.DRAFT,
        },
      });
      cartService.getCartByCustomerId.mockResolvedValue({
        source: OrderSource.TREATMENT,
        surveyRecommendationId: null,
        treatmentPhaseId: 'phase-1',
        items: [{ productVariantId: 'v1', quantity: 1 }],
      });

      await expect(service.createFromCart('user-1', DTO)).rejects.toThrow(
        'Liệu trình chưa được thanh toán',
      );
      expect(savedOrders).toHaveLength(0);
    });

    it('rejects when the cart is missing the phase linkage', async () => {
      cartService.getCartByCustomerId.mockResolvedValue({
        source: OrderSource.TREATMENT,
        surveyRecommendationId: null,
        treatmentPhaseId: null,
        items: [{ productVariantId: 'v1', quantity: 1 }],
      });

      await expect(service.createFromCart('user-1', DTO)).rejects.toThrow(
        'Giỏ hàng TREATMENT thiếu treatmentPhaseId',
      );
    });
  });

  it('allows non-recommended variants in a SURVEY order', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.SURVEY,
      surveyRecommendationId: 'rec-1',
      treatmentPhaseId: null,
      items: [
        { productVariantId: 'v1', quantity: 1 },
        { productVariantId: 'v-extra', quantity: 1 },
      ],
    });
    recommendationService.getByIdForCustomer.mockResolvedValue({
      id: 'rec-1',
      customerSurveyId: 'survey-1',
      items: [{ id: 'ri-1', productVariantId: 'v1' }],
    } as SurveyRecommendation);
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      source: OrderSource.SURVEY,
      customerSurveyId: 'survey-1',
      surveyRecommendationId: 'rec-1',
      subtotalVnd: 250000,
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 32000,
      totalVnd: 282000,
      items: [],
      delivery: deliveryFixture,
      createdAt: new Date(),
    });

    await service.createFromCart('user-1', DTO);
    expect(savedOrders[0].source).toBe(OrderSource.SURVEY);
    expect(savedOrderItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productVariantId: 'v-extra',
          surveyRecommendationItemId: null,
        }),
      ]),
    );
  });

  it('creates catalog orders without recommendation linkage', async () => {
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      treatmentPhaseId: null,
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
      treatmentPhaseId: null,
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
      treatmentPhaseId: null,
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
      treatmentPhaseId: null,
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

  it('rejects the order when a cart item exceeds available stock', async () => {
    stockService.getAvailableQuantities.mockResolvedValue(new Map([['v1', 1]]));
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      treatmentPhaseId: null,
      items: [{ productVariantId: 'v1', quantity: 2 }],
    });

    await expect(service.createFromCart('user-1', DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(savedOrders).toHaveLength(0);
    expect(deliveryService.quoteFee).not.toHaveBeenCalled();
  });

  it('rejects the order when a cart item is out of stock', async () => {
    stockService.getAvailableQuantities.mockResolvedValue(new Map());
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      treatmentPhaseId: null,
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });

    await expect(service.createFromCart('user-1', DTO)).rejects.toThrow(
      'đã hết hàng',
    );
    expect(savedOrders).toHaveLength(0);
  });

  it('rejects when the GHN provider row is missing', async () => {
    deliveryProviderRepository.findOneBy.mockResolvedValue(null);
    cartService.getCartByCustomerId.mockResolvedValue({
      source: OrderSource.CATALOG,
      surveyRecommendationId: null,
      treatmentPhaseId: null,
      items: [{ productVariantId: 'v1', quantity: 1 }],
    });

    await expect(service.createFromCart('user-1', DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deliveryService.quoteFee).not.toHaveBeenCalled();
  });

  describe('retryFulfillment', () => {
    const shortfallOrder = () => ({
      id: 'order-1',
      status: OrderStatus.PAID,
      source: OrderSource.CATALOG,
      customerSurveyId: null,
      surveyRecommendationId: null,
      subtotalVnd: 200000,
      discountVnd: 0,
      discountType: null,
      shippingFeeVnd: 32000,
      totalVnd: 232000,
      stockShortfall: true,
      items: [
        {
          id: 'oi-1',
          productVariantId: 'v1',
          quantity: 1,
          unitPriceVnd: 100000,
          lineTotalVnd: 100000,
          stockDeductedAt: new Date('2026-08-01'),
          productVariant: { sku: 'SKU-1' },
        },
        {
          id: 'oi-2',
          productVariantId: 'v2',
          quantity: 2,
          unitPriceVnd: 50000,
          lineTotalVnd: 100000,
          stockDeductedAt: null,
          productVariant: { sku: 'SKU-2' },
        },
      ],
      delivery: deliveryFixture,
      cancellation: null,
      createdAt: new Date(),
    });

    it('throws NotFound for an unknown order', async () => {
      orderRepository.findOne.mockResolvedValue(null);
      await expect(service.retryFulfillment('missing')).rejects.toThrow(
        'Không tìm thấy đơn hàng',
      );
    });

    it('rejects orders that are not PAID', async () => {
      orderRepository.findOne.mockResolvedValue({
        ...shortfallOrder(),
        status: OrderStatus.PENDING,
      });
      await expect(service.retryFulfillment('order-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stockService.deductByVariantId).not.toHaveBeenCalled();
    });

    it('deducts only pending items, clears the flag, and releases GHN handover', async () => {
      orderRepository.findOne.mockResolvedValue(shortfallOrder());

      const result = await service.retryFulfillment('order-1');

      expect(stockService.deductByVariantId).toHaveBeenCalledTimes(1);
      expect(stockService.deductByVariantId).toHaveBeenCalledWith(
        'v2',
        2,
        expect.any(String),
        'oi-2',
      );
      expect(orderItemRepository.update).toHaveBeenCalledWith(
        { id: 'oi-2' },
        { stockDeductedAt: expect.any(Date) },
      );
      expect(orderRepository.update).toHaveBeenCalledWith(
        { id: 'order-1' },
        { stockShortfall: false },
      );
      expect(deliveryService.createGhnOrderForPaidOrder).toHaveBeenCalledWith(
        'order-1',
      );
      expect(result.stockShortfall).toBe(false);
    });

    it('keeps the flag and reports missing SKUs when stock is still short', async () => {
      orderRepository.findOne.mockResolvedValue(shortfallOrder());
      stockService.deductByVariantId.mockRejectedValue(
        new BadRequestException('Không đủ hàng tồn kho'),
      );

      await expect(service.retryFulfillment('order-1')).rejects.toThrow(
        'Vẫn thiếu hàng tồn kho cho: SKU-2',
      );
      expect(orderRepository.update).toHaveBeenCalledWith(
        { id: 'order-1' },
        { stockShortfall: true },
      );
      expect(deliveryService.createGhnOrderForPaidOrder).not.toHaveBeenCalled();
    });
  });
});
