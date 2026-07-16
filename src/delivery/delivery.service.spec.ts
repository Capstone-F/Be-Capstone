import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order } from '../commerce/order.entity';
import { OrderSource, OrderStatus } from '../commerce/enums';
import { Payment } from '../payments/payment.entity';
import { PaymentStatus } from '../payments/enums';
import { Customer } from '../users/customer.entity';
import { DeliveryFee } from './delivery-fee.entity';
import { DeliveryProvider } from './delivery-provider.entity';
import { Delivery } from './delivery.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryType } from './enums';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let feeRepository: { find: jest.Mock; findOne: jest.Mock };
  let providerRepository: { findOne: jest.Mock };
  let deliveryRepository: { findOne: jest.Mock };
  let orderRepository: { findOne: jest.Mock };
  let paymentRepository: { findOne: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let savedDeliveries: Delivery[];
  let savedOrders: Order[];

  const customer = { id: 'cust-1', userId: 'user-1' } as Customer;
  const provider = {
    id: 'prov-1',
    code: 'GHN',
    name: 'Giao Hàng Nhanh',
    isActive: true,
  } as DeliveryProvider;
  const fee = {
    id: 'fee-1',
    providerId: 'prov-1',
    type: DeliveryType.STANDARD,
    feeVnd: 30000,
    isActive: true,
    provider,
  } as DeliveryFee;

  const baseOrder = {
    id: 'order-1',
    customerId: 'cust-1',
    status: OrderStatus.PENDING,
    source: OrderSource.CATALOG,
    customerSurveyId: null,
    surveyRecommendationId: null,
    subtotalVnd: 200000,
    discountVnd: 20000,
    discountType: null,
    shippingFeeVnd: 0,
    totalVnd: 180000,
    items: [],
    createdAt: new Date(),
  } as Order;

  beforeEach(async () => {
    savedDeliveries = [];
    savedOrders = [];
    feeRepository = {
      find: jest.fn().mockResolvedValue([fee]),
      findOne: jest.fn().mockResolvedValue(fee),
    };
    providerRepository = {
      findOne: jest.fn().mockResolvedValue(provider),
    };
    deliveryRepository = {
      findOne: jest.fn(),
    };
    orderRepository = {
      findOne: jest.fn(),
    };
    paymentRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };

    const dataSource = {
      transaction: async (cb: (m: unknown) => Promise<unknown>) =>
        cb({
          findOne: async (
            entity: unknown,
            opts: { where: { orderId: string } },
          ) => {
            if (entity === Delivery) {
              return (
                savedDeliveries.find((d) => d.orderId === opts.where.orderId) ??
                null
              );
            }
            return null;
          },
          create: (_entity: unknown, data: Partial<Delivery>) =>
            ({ ...data }) as Delivery,
          save: async (value: Delivery | Order) => {
            if ((value as Delivery).shippingAddress !== undefined) {
              const d = value as Delivery;
              if (!d.id) d.id = `del-${savedDeliveries.length + 1}`;
              const idx = savedDeliveries.findIndex(
                (x) => x.orderId === d.orderId,
              );
              if (idx >= 0) savedDeliveries[idx] = d;
              else savedDeliveries.push(d);
              return d;
            }
            const o = value as Order;
            savedOrders.push(o);
            return o;
          },
          update: async (
            _entity: unknown,
            id: string,
            values: Partial<Order>,
          ) => {
            savedOrders.push({ id, ...values } as Order);
            return { affected: 1 };
          },
        }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: getRepositoryToken(DeliveryFee), useValue: feeRepository },
        {
          provide: getRepositoryToken(DeliveryProvider),
          useValue: providerRepository,
        },
        {
          provide: getRepositoryToken(Delivery),
          useValue: deliveryRepository,
        },
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(DeliveryService);
  });

  describe('computeTotalVnd', () => {
    it('adds shipping after discount', () => {
      expect(DeliveryService.computeTotalVnd(200000, 20000, 30000)).toBe(
        210000,
      );
    });

    it('floors at zero', () => {
      expect(DeliveryService.computeTotalVnd(10000, 50000, 0)).toBe(0);
    });
  });

  describe('listOptions', () => {
    it('returns active provider fees', async () => {
      const options = await service.listOptions();
      expect(options).toEqual([
        {
          providerId: 'prov-1',
          providerCode: 'GHN',
          providerName: 'Giao Hàng Nhanh',
          type: DeliveryType.STANDARD,
          feeVnd: 30000,
        },
      ]);
    });
  });

  describe('attachToOrder', () => {
    it('locks shipping fee and recomputes totalVnd', async () => {
      orderRepository.findOne
        .mockResolvedValueOnce({ ...baseOrder })
        .mockResolvedValueOnce({
          ...baseOrder,
          shippingFeeVnd: 30000,
          totalVnd: 210000,
        });

      const result = await service.attachToOrder('user-1', 'order-1', {
        providerId: 'prov-1',
        type: DeliveryType.STANDARD,
        shippingAddress: '123 Nguyen Hue, Q1, HCMC',
      });

      expect(savedDeliveries[0].feeVnd).toBe(30000);
      expect(savedOrders[0].shippingFeeVnd).toBe(30000);
      expect(savedOrders[0].totalVnd).toBe(210000);
      expect(result.shippingFeeVnd).toBe(30000);
      expect(result.totalVnd).toBe(210000);
    });

    it('rejects when checkout has started', async () => {
      orderRepository.findOne.mockResolvedValue({ ...baseOrder });
      paymentRepository.findOne.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
      });

      await expect(
        service.attachToOrder('user-1', 'order-1', {
          providerId: 'prov-1',
          type: DeliveryType.STANDARD,
          shippingAddress: '123 Nguyen Hue, Q1, HCMC',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-PENDING orders', async () => {
      orderRepository.findOne.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.PAID,
      });

      await expect(
        service.attachToOrder('user-1', 'order-1', {
          providerId: 'prov-1',
          type: DeliveryType.STANDARD,
          shippingAddress: '123 Nguyen Hue, Q1, HCMC',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing orders', async () => {
      orderRepository.findOne.mockResolvedValue(null);
      await expect(
        service.attachToOrder('user-1', 'missing', {
          providerId: 'prov-1',
          type: DeliveryType.STANDARD,
          shippingAddress: '123 Nguyen Hue, Q1, HCMC',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects users without a customer profile', async () => {
      customerRepository.findOne.mockResolvedValue(null);
      await expect(
        service.attachToOrder('user-1', 'order-1', {
          providerId: 'prov-1',
          type: DeliveryType.STANDARD,
          shippingAddress: '123 Nguyen Hue, Q1, HCMC',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
