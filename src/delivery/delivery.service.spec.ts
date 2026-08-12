import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { CartService } from '../cart/cart.service';
import { OrderStatus } from '../commerce/enums';
import { Order } from '../commerce/order.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { Customer } from '../users/customer.entity';
import { DeliveryService } from './delivery.service';
import { Delivery } from './delivery.entity';
import { DeliveryStatusEvent } from './delivery-status-event.entity';
import { DeliveryStatus } from './enums';
import { GhnClient } from './ghn.client';
import { ShippingAddressDto } from './dto/shipping-address.dto';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const SHIPPING_CONFIG = {
  token: 'TOK',
  shopId: '885',
  baseUrl: 'https://ghn.test',
  fromDistrictId: 1442,
  fromWardCode: '21012',
  webhookSecret: 'shh',
};

const ADDRESS: ShippingAddressDto = {
  recipientName: 'Nguyen Van A',
  recipientPhone: '0901234567',
  provinceId: 202,
  districtId: 1449,
  wardCode: '21211',
  streetAddress: '123 Le Loi',
};

describe('DeliveryService', () => {
  let ghn: Mocked<
    Pick<GhnClient, 'calculateFee' | 'createOrder' | 'getProvinces'>
  >;
  let deliveryRepo: Mocked<Pick<Repository<Delivery>, 'findOne' | 'update'>>;
  let eventRepo: Mocked<
    Pick<Repository<DeliveryStatusEvent>, 'create' | 'save'>
  >;
  let orderRepo: Mocked<Pick<Repository<Order>, 'update'>>;
  let variantRepo: Mocked<Pick<Repository<ProductVariant>, 'find'>>;
  let customerRepo: Mocked<Pick<Repository<Customer>, 'findOne'>>;
  let cartService: Mocked<Pick<CartService, 'getCartByCustomerId'>>;
  let service: DeliveryService;

  beforeEach(() => {
    ghn = {
      calculateFee: jest.fn().mockResolvedValue({ total: 32000 }),
      createOrder: jest.fn(),
      getProvinces: jest.fn(),
    };
    deliveryRepo = { findOne: jest.fn(), update: jest.fn() };
    eventRepo = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn((v: unknown) => v),
    };
    orderRepo = { update: jest.fn() };
    variantRepo = { find: jest.fn() };
    customerRepo = { findOne: jest.fn() };
    cartService = { getCartByCustomerId: jest.fn() };

    service = new DeliveryService(
      deliveryRepo as unknown as Repository<Delivery>,
      eventRepo as unknown as Repository<DeliveryStatusEvent>,
      orderRepo as unknown as Repository<Order>,
      variantRepo as unknown as Repository<ProductVariant>,
      customerRepo as unknown as Repository<Customer>,
      cartService as unknown as CartService,
      ghn as unknown as GhnClient,
      { shippingConfig: SHIPPING_CONFIG } as unknown as AppConfigService,
    );
  });

  describe('quoteFee', () => {
    it('sums item weights and sends the shop origin to GHN', async () => {
      const fee = await service.quoteFee(ADDRESS, [
        { weightGram: 200, quantity: 2 },
        { weightGram: 150, quantity: 1 },
      ]);

      expect(fee).toBe(32000);
      const sent = ghn.calculateFee.mock.calls[0][0];
      expect(sent.weight).toBe(550);
      expect(sent.to_district_id).toBe(1449);
      expect(sent.to_ward_code).toBe('21211');
      expect(sent.from_district_id).toBe(1442);
      expect(sent.from_ward_code).toBe('21012');
      expect(sent.service_type_id).toBe(2);
    });

    it('clamps parcel weight to the GHN maximum of 30000g', async () => {
      await service.quoteFee(ADDRESS, [{ weightGram: 20000, quantity: 5 }]);
      expect(ghn.calculateFee.mock.calls[0][0].weight).toBe(30000);
    });

    it('raises parcel weight to the GHN minimum of 50g', async () => {
      await service.quoteFee(ADDRESS, [{ weightGram: 1, quantity: 1 }]);
      expect(ghn.calculateFee.mock.calls[0][0].weight).toBe(50);
    });

    it('falls back to the default item weight when a variant has none', async () => {
      await service.quoteFee(ADDRESS, [{ weightGram: 0, quantity: 3 }]);
      expect(ghn.calculateFee.mock.calls[0][0].weight).toBe(600);
    });
  });

  describe('createGhnOrderForPaidOrder', () => {
    const DELIVERY = {
      id: 'd1',
      orderId: 'o1',
      providerOrderCode: null,
      districtId: 1449,
      wardCode: '21211',
      recipientName: 'Nguyen Van A',
      recipientPhone: '0901234567',
      streetAddress: '123 Le Loi',
      order: {
        items: [
          {
            quantity: 2,
            unitPriceVnd: 100000,
            productVariant: {
              sku: 'SKU-1',
              weightGram: 200,
              product: { name: 'Cleanser' },
            },
          },
        ],
      },
    };

    it('creates a GHN order and stores the tracking code', async () => {
      deliveryRepo.findOne.mockResolvedValue(DELIVERY);
      ghn.createOrder.mockResolvedValue({
        order_code: 'FFFNL9HH',
        expected_delivery_time: '2026-07-20T16:00:00Z',
        total_fee: 32000,
      });

      await service.createGhnOrderForPaidOrder('o1');

      const sent = ghn.createOrder.mock.calls[0][0];
      // Customer prepaid shipping via VNPay, so the shop settles with GHN and there is no COD.
      expect(sent.payment_type_id).toBe(1);
      expect(sent.cod_amount).toBe(0);
      expect(sent.client_order_code).toBe('o1');
      expect(sent.to_district_id).toBe(1449);
      expect(sent.weight).toBe(400);
      expect(sent.items).toEqual([
        {
          name: 'Cleanser',
          code: 'SKU-1',
          quantity: 2,
          weight: 200,
          price: 100000,
        },
      ]);

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'd1' }),
        expect.objectContaining({
          providerOrderCode: 'FFFNL9HH',
          status: 'PROCESSING',
        }),
      );
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 'o1', status: 'PAID' },
        { status: 'PROCESSING' },
      );
    });

    it('is a no-op when the GHN order already exists', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        ...DELIVERY,
        providerOrderCode: 'FFFNL9HH',
      });

      await service.createGhnOrderForPaidOrder('o1');

      expect(ghn.createOrder).not.toHaveBeenCalled();
      expect(deliveryRepo.update).not.toHaveBeenCalled();
    });

    it('swallows GHN failures so the IPN ack is never affected', async () => {
      deliveryRepo.findOne.mockResolvedValue(DELIVERY);
      ghn.createOrder.mockRejectedValue(new Error('GHN down'));

      await expect(
        service.createGhnOrderForPaidOrder('o1'),
      ).resolves.toBeUndefined();
      expect(deliveryRepo.update).not.toHaveBeenCalled();
    });

    it('does not throw when the order has no delivery row', async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createGhnOrderForPaidOrder('o1'),
      ).resolves.toBeUndefined();
      expect(ghn.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('handleGhnWebhook', () => {
    const BODY = {
      OrderCode: 'FFFNL9HH',
      Status: 'delivered',
      Time: '2026-07-16T10:00:00Z',
    };

    it('rejects a wrong webhook secret before touching the database', async () => {
      await expect(
        service.handleGhnWebhook('wrong', BODY, BODY),
      ).rejects.toThrow(UnauthorizedException);
      expect(deliveryRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects when no webhook secret is configured', async () => {
      const unconfigured = new DeliveryService(
        deliveryRepo as unknown as Repository<Delivery>,
        eventRepo as unknown as Repository<DeliveryStatusEvent>,
        orderRepo as unknown as Repository<Order>,
        variantRepo as unknown as Repository<ProductVariant>,
        customerRepo as unknown as Repository<Customer>,
        cartService as unknown as CartService,
        ghn as unknown as GhnClient,
        {
          shippingConfig: { ...SHIPPING_CONFIG, webhookSecret: '' },
        } as unknown as AppConfigService,
      );

      await expect(
        unconfigured.handleGhnWebhook('', BODY, BODY),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('maps delivered to DELIVERED and moves the order to DELIVERED', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: null,
        shippedAt: null,
      });

      await service.handleGhnWebhook('shh', BODY, BODY);

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        { id: 'd1' },
        expect.objectContaining({
          status: DeliveryStatus.DELIVERED,
          providerStatus: 'delivered',
        }),
      );
      // Guard: never resurrect CANCELLED/REFUNDED orders from a late shipping event.
      expect(orderRepo.update).toHaveBeenCalledWith(
        {
          id: 'o1',
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.REFUNDED])),
        },
        { status: OrderStatus.DELIVERED },
      );
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ applied: true, providerStatus: 'delivered' }),
      );
    });

    it('does not move the order on a return, but does update the delivery', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: null,
      });

      await service.handleGhnWebhook(
        'shh',
        { ...BODY, Status: 'returned' },
        BODY,
      );

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        { id: 'd1' },
        expect.objectContaining({ status: DeliveryStatus.RETURNED }),
      );
      // The order was paid; refunding is a human decision, not a webhook's.
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('ignores a webhook older than the last applied event but still audits it', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: new Date('2026-07-16T12:00:00Z'),
      });

      await service.handleGhnWebhook(
        'shh',
        { ...BODY, Status: 'picking', Time: '2026-07-16T10:00:00Z' },
        BODY,
      );

      expect(deliveryRepo.update).not.toHaveBeenCalled();
      expect(orderRepo.update).not.toHaveBeenCalled();
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ applied: false }),
      );
    });

    it('audits but ignores a status GHN sends that we do not map', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: null,
      });

      await service.handleGhnWebhook(
        'shh',
        { ...BODY, Status: 'some_new_ghn_status' },
        BODY,
      );

      expect(deliveryRepo.update).not.toHaveBeenCalled();
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ applied: false, mappedStatus: null }),
      );
    });

    it('ignores an unknown OrderCode without throwing', async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      // Must not throw: a non-200 makes GHN retry 10x for an order we will never know.
      await expect(
        service.handleGhnWebhook('shh', BODY, BODY),
      ).resolves.toBeUndefined();
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    it('stores the full raw payload, not the whitelisted DTO', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: null,
      });
      const raw = { ...BODY, CODAmount: 0, TotalFee: 32000, Weight: 400 };

      await service.handleGhnWebhook('shh', BODY, raw);

      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rawWebhook: raw }),
      );
    });

    it('stamps shippedAt on the first SHIPPED transition', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        lastStatusAt: null,
        shippedAt: null,
      });

      await service.handleGhnWebhook(
        'shh',
        { ...BODY, Status: 'picked' },
        BODY,
      );

      expect(deliveryRepo.update.mock.calls[0][1].shippedAt).toEqual(
        new Date('2026-07-16T10:00:00Z'),
      );
    });
  });

  describe('getDeliveryForUser', () => {
    it('throws NotFound when the delivery belongs to another customer', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getDeliveryForUser('user-1', 'order-999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes the lookup to the calling customer', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      deliveryRepo.findOne.mockResolvedValue({
        id: 'd1',
        orderId: 'o1',
        status: DeliveryStatus.DELIVERED,
        type: 'STANDARD',
        providerOrderCode: 'FFFNL9HH',
        shippingFeeVnd: 32000,
        expectedDeliveryTime: null,
        shippedAt: null,
        deliveredAt: null,
        recipientName: 'Nguyen Van A',
        streetAddress: '123 Le Loi',
        statusEvents: [
          { providerStatus: 'delivered', occurredAt: new Date('2026-07-16') },
        ],
      });

      const result = await service.getDeliveryForUser('user-1', 'o1');

      expect(result.providerOrderCode).toBe('FFFNL9HH');
      expect(result.statusEvents).toHaveLength(1);
      // Ownership must be enforced in the query, not filtered after the fact.
      expect(deliveryRepo.findOne.mock.calls[0][0].where).toMatchObject({
        orderId: 'o1',
        order: { customerId: 'cust-1' },
      });
    });
  });

  describe('quoteFeeForCart', () => {
    it('prices the caller cart using variant weights', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      cartService.getCartByCustomerId.mockResolvedValue({
        source: 'CATALOG',
        surveyRecommendationId: null,
        items: [{ productVariantId: 'v1', quantity: 2 }],
      });
      variantRepo.find.mockResolvedValue([{ id: 'v1', weightGram: 250 }]);

      const result = await service.quoteFeeForCart('user-1', ADDRESS);

      expect(result).toEqual({ shippingFeeVnd: 32000 });
      expect(ghn.calculateFee.mock.calls[0][0].weight).toBe(500);
    });

    it('rejects an empty cart', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'cust-1' });
      cartService.getCartByCustomerId.mockResolvedValue({
        source: null,
        surveyRecommendationId: null,
        items: [],
      });

      await expect(service.quoteFeeForCart('user-1', ADDRESS)).rejects.toThrow(
        'Cart is empty',
      );
    });
  });

  describe('confirmHandoverToProvider', () => {
    const BASE_DELIVERY = {
      id: 'd1',
      orderId: 'o1',
      providerOrderCode: 'FFFNL9HH',
      status: DeliveryStatus.PROCESSING,
      handedOverAt: null,
      handedOverByUserId: null,
      handoverNote: null,
      lastStatusAt: null,
      shippedAt: null,
      deliveredAt: null,
      type: 'STANDARD',
      shippingFeeVnd: 32000,
      expectedDeliveryTime: null,
      providerStatus: 'picking',
      recipientName: 'Nguyen Van A',
      streetAddress: '123 Le Loi',
      order: { status: OrderStatus.PROCESSING },
      statusEvents: [],
    };

    it('stamps handover fields and applies picked', async () => {
      deliveryRepo.findOne
        .mockResolvedValueOnce({ ...BASE_DELIVERY })
        .mockResolvedValueOnce({
          ...BASE_DELIVERY,
          handedOverAt: new Date('2026-07-16T10:00:00Z'),
          handedOverByUserId: 'staff-1',
          handoverNote: 'Left at dock',
          status: DeliveryStatus.SHIPPED,
          providerStatus: 'picked',
          shippedAt: new Date('2026-07-16T10:00:00Z'),
          lastStatusAt: new Date('2026-07-16T10:00:00Z'),
        });
      deliveryRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.confirmHandoverToProvider(
        'staff-1',
        'o1',
        'Left at dock',
      );

      expect(deliveryRepo.update).toHaveBeenCalledWith(
        { id: 'd1', handedOverAt: IsNull() },
        expect.objectContaining({
          handedOverByUserId: 'staff-1',
          handoverNote: 'Left at dock',
        }),
      );
      expect(deliveryRepo.update).toHaveBeenCalledWith(
        { id: 'd1' },
        expect.objectContaining({
          status: DeliveryStatus.SHIPPED,
          providerStatus: 'picked',
        }),
      );
      expect(orderRepo.update).toHaveBeenCalledWith(
        {
          id: 'o1',
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.REFUNDED])),
        },
        { status: OrderStatus.SHIPPED },
      );
      expect(eventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          applied: true,
          providerStatus: 'picked',
          rawWebhook: expect.objectContaining({
            source: 'STAFF_HANDOVER',
            userId: 'staff-1',
            note: 'Left at dock',
          }),
        }),
      );
      expect(result.handedOverByUserId).toBe('staff-1');
      expect(result.handoverNote).toBe('Left at dock');
    });

    it('rejects when providerOrderCode is missing', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        ...BASE_DELIVERY,
        providerOrderCode: null,
      });

      await expect(
        service.confirmHandoverToProvider('staff-1', 'o1'),
      ).rejects.toThrow(BadRequestException);
      expect(deliveryRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a second handover with ConflictException', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        ...BASE_DELIVERY,
        handedOverAt: new Date('2026-07-16T09:00:00Z'),
      });

      await expect(
        service.confirmHandoverToProvider('staff-1', 'o1'),
      ).rejects.toThrow(ConflictException);
      expect(deliveryRepo.update).not.toHaveBeenCalled();
    });

    it('rejects when the order is cancelled', async () => {
      deliveryRepo.findOne.mockResolvedValue({
        ...BASE_DELIVERY,
        order: { status: OrderStatus.CANCELLED },
      });

      await expect(
        service.confirmHandoverToProvider('staff-1', 'o1'),
      ).rejects.toThrow(BadRequestException);
      expect(deliveryRepo.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the order has no delivery', async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.confirmHandoverToProvider('staff-1', 'o1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
