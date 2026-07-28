import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { AppConfigService } from '../config/config.service';
import { OrderStatus } from '../commerce/enums';
import { Order } from '../commerce/order.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { Customer } from '../users/customer.entity';
import { Delivery } from './delivery.entity';
import { DeliveryStatusEvent } from './delivery-status-event.entity';
import { ShippingAddressDto } from './dto/shipping-address.dto';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { FeeQuoteResponseDto } from './dto/fee-quote.dto';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { DeliveryStatus } from './enums';
import { GhnClient } from './ghn.client';
import { GHN_STATUS_MAP } from './ghn.status-map';
import {
  DEFAULT_ITEM_WEIGHT_GRAM,
  DEFAULT_PARCEL_BOX,
  GHN_PAYMENT_TYPE_SHOP_PAYS,
  GHN_REQUIRED_NOTE,
  GHN_SERVICE_TYPE_STANDARD,
  MAX_PARCEL_WEIGHT_GRAM,
  MIN_PARCEL_WEIGHT_GRAM,
} from './ghn.constants';
import { GhnDistrict, GhnProvince, GhnWard } from './ghn.types';

/** What the fee calculation needs to know about one line of a cart/order. */
export type ParcelLine = { weightGram: number; quantity: number };

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryStatusEvent)
    private readonly statusEventRepository: Repository<DeliveryStatusEvent>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly cartService: CartService,
    private readonly ghn: GhnClient,
    private readonly config: AppConfigService,
  ) {}

  getProvinces(): Promise<GhnProvince[]> {
    return this.ghn.getProvinces();
  }

  getDistricts(provinceId: number): Promise<GhnDistrict[]> {
    return this.ghn.getDistricts(provinceId);
  }

  getWards(districtId: number): Promise<GhnWard[]> {
    return this.ghn.getWards(districtId);
  }

  /**
   * Quotes the GHN shipping fee for an address + parcel lines.
   *
   * Shared by the preview endpoint and order creation so both always price identically.
   */
  async quoteFee(
    address: ShippingAddressDto,
    lines: ParcelLine[],
  ): Promise<number> {
    const cfg = this.config.shippingConfig;
    const data = await this.ghn.calculateFee({
      from_district_id: cfg.fromDistrictId,
      from_ward_code: cfg.fromWardCode,
      service_type_id: GHN_SERVICE_TYPE_STANDARD,
      to_district_id: address.districtId,
      to_ward_code: address.wardCode,
      weight: DeliveryService.parcelWeightGram(lines),
      length: DEFAULT_PARCEL_BOX.lengthCm,
      width: DEFAULT_PARCEL_BOX.widthCm,
      height: DEFAULT_PARCEL_BOX.heightCm,
      insurance_value: 0,
    });
    return data.total;
  }

  /** Preview endpoint: prices the caller's current cart. */
  async quoteFeeForCart(
    userId: string,
    address: ShippingAddressDto,
  ): Promise<FeeQuoteResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.cartService.getCartByCustomerId(customer.id);
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const variants = await this.variantRepository.find({
      where: { id: In(cart.items.map((item) => item.productVariantId)) },
    });
    const weightByVariant = new Map(variants.map((v) => [v.id, v.weightGram]));

    const shippingFeeVnd = await this.quoteFee(
      address,
      cart.items.map((item) => ({
        weightGram: weightByVariant.get(item.productVariantId) ?? 0,
        quantity: item.quantity,
      })),
    );
    return { shippingFeeVnd };
  }

  /**
   * Creates the GHN shipping order for a paid order and stores the tracking code.
   *
   * Called from the VNPay IPN success path, so it is deliberately:
   *  - idempotent — guards on providerOrderCode, and claims it with a conditional UPDATE
   *  - non-throwing — a GHN outage must not turn a successful IPN into a VNPay retry storm
   *
   * Because the IPN's own once-only gate means a failure here is never retried, the
   * order stays PAID with providerOrderCode null. Re-calling this method is the recovery.
   */
  async createGhnOrderForPaidOrder(orderId: string): Promise<void> {
    try {
      const delivery = await this.deliveryRepository.findOne({
        where: { orderId },
        relations: [
          'order',
          'order.items',
          'order.items.productVariant',
          'order.items.productVariant.product',
        ],
      });
      if (!delivery) {
        this.logger.error(
          `No delivery row for paid order ${orderId} — cannot create GHN order`,
        );
        return;
      }
      if (delivery.providerOrderCode) {
        this.logger.log(
          `GHN order already exists for order ${orderId} (${delivery.providerOrderCode})`,
        );
        return;
      }

      const items = (delivery.order?.items ?? []).map((item) => ({
        name:
          item.productVariant?.product?.name ??
          item.productVariant?.sku ??
          'Item',
        code: item.productVariant?.sku,
        quantity: item.quantity,
        weight: item.productVariant?.weightGram || DEFAULT_ITEM_WEIGHT_GRAM,
        price: item.unitPriceVnd,
      }));

      const data = await this.ghn.createOrder({
        to_name: delivery.recipientName!,
        to_phone: delivery.recipientPhone!,
        to_address: delivery.streetAddress!,
        to_ward_code: delivery.wardCode!,
        to_district_id: delivery.districtId!,
        weight: DeliveryService.parcelWeightGram(
          items.map((item) => ({
            weightGram: item.weight,
            quantity: item.quantity,
          })),
        ),
        length: DEFAULT_PARCEL_BOX.lengthCm,
        width: DEFAULT_PARCEL_BOX.widthCm,
        height: DEFAULT_PARCEL_BOX.heightCm,
        service_type_id: GHN_SERVICE_TYPE_STANDARD,
        payment_type_id: GHN_PAYMENT_TYPE_SHOP_PAYS,
        cod_amount: 0,
        required_note: GHN_REQUIRED_NOTE,
        client_order_code: orderId,
        items,
      });

      // Conditional update: only the first writer claims the code.
      await this.deliveryRepository.update(
        { id: delivery.id, providerOrderCode: IsNull() },
        {
          providerOrderCode: data.order_code,
          status: DeliveryStatus.PROCESSING,
          expectedDeliveryTime: data.expected_delivery_time
            ? new Date(data.expected_delivery_time)
            : null,
        },
      );
      await this.orderRepository.update(
        { id: orderId, status: OrderStatus.PAID },
        { status: OrderStatus.PROCESSING },
      );

      this.logger.log(
        `GHN order ${data.order_code} created for order ${orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `GHN order creation failed for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Applies a GHN status callback to the delivery and, where warranted, the order.
   *
   * Trust model: GHN does not sign its callbacks, so the only gate is the shared secret
   * in the URL path. Beyond that we treat the body as untrusted — we act solely on
   * `Status`, only for an OrderCode we issued, and never read its money fields.
   *
   * Ordering: GHN gives no delivery-order guarantee and retries 10x/5s on non-200, so a
   * webhook older than the last applied event is audited and ignored rather than applied.
   *
   * @param rawBody the untouched request body — the validated DTO has non-declared
   *   fields stripped by the global whitelist pipe, so it is unfit for the audit trail.
   */
  async handleGhnWebhook(
    secret: string,
    body: GhnWebhookDto,
    rawBody: unknown,
  ): Promise<void> {
    this.assertWebhookSecret(secret);

    const delivery = await this.deliveryRepository.findOne({
      where: { providerOrderCode: body.OrderCode },
    });
    if (!delivery) {
      // Nothing to do. The caller still answers 200 so GHN does not retry 10x.
      this.logger.warn(`GHN webhook for unknown OrderCode=${body.OrderCode}`);
      return;
    }

    const mapping = GHN_STATUS_MAP[body.Status];
    const occurredAt = new Date(body.Time);
    const isStale =
      delivery.lastStatusAt !== null && occurredAt <= delivery.lastStatusAt;
    const applied = Boolean(mapping) && !isStale;

    // Audit every webhook, applied or not.
    await this.statusEventRepository.save(
      this.statusEventRepository.create({
        deliveryId: delivery.id,
        providerStatus: body.Status,
        mappedStatus: mapping?.delivery ?? null,
        occurredAt,
        applied,
        rawWebhook: rawBody,
      }),
    );

    if (!mapping) {
      this.logger.warn(
        `GHN webhook with unmapped Status=${body.Status} for ${body.OrderCode}`,
      );
      return;
    }
    if (isStale) {
      this.logger.log(
        `GHN webhook out of order for ${body.OrderCode} (${body.Status}) — ignored`,
      );
      return;
    }

    await this.deliveryRepository.update(
      { id: delivery.id },
      {
        status: mapping.delivery,
        providerStatus: body.Status,
        lastStatusAt: occurredAt,
        ...(mapping.delivery === DeliveryStatus.SHIPPED && !delivery.shippedAt
          ? { shippedAt: occurredAt }
          : {}),
        ...(mapping.delivery === DeliveryStatus.DELIVERED
          ? { deliveredAt: occurredAt }
          : {}),
      },
    );

    if (mapping.order) {
      await this.orderRepository.update(
        { id: delivery.orderId },
        { status: mapping.order },
      );
    }

    this.logger.log(
      `GHN webhook applied for ${body.OrderCode}: ${body.Status} -> ${mapping.delivery}`,
    );
  }

  private assertWebhookSecret(provided: string): void {
    const expected = this.config.shippingConfig.webhookSecret;
    if (!expected) {
      this.logger.error(
        'GHN webhook received but GHN_WEBHOOK_SECRET is not configured — rejecting',
      );
      throw new UnauthorizedException('GHN webhook secret is not configured');
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('GHN webhook rejected: invalid secret');
      throw new UnauthorizedException('Invalid GHN webhook secret');
    }
  }

  /** Delivery + tracking history for one of the caller's own orders. */
  async getDeliveryForUser(
    userId: string,
    orderId: string,
  ): Promise<DeliveryResponseDto> {
    const customer = await this.requireCustomer(userId);
    const delivery = await this.deliveryRepository.findOne({
      // Ownership is part of the query so another customer's order 404s rather than leaks.
      where: { orderId, order: { customerId: customer.id } },
      relations: ['statusEvents'],
      order: { statusEvents: { occurredAt: 'ASC' } },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} not found`);
    }

    return {
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.status,
      type: delivery.type,
      providerOrderCode: delivery.providerOrderCode,
      shippingFeeVnd: delivery.shippingFeeVnd,
      expectedDeliveryTime: delivery.expectedDeliveryTime,
      shippedAt: delivery.shippedAt,
      deliveredAt: delivery.deliveredAt,
      recipientName: delivery.recipientName,
      streetAddress: delivery.streetAddress,
      statusEvents: (delivery.statusEvents ?? []).map((event) => ({
        providerStatus: event.providerStatus,
        occurredAt: event.occurredAt,
      })),
    };
  }

  /** Total parcel weight in grams, clamped to GHN's accepted range. */
  static parcelWeightGram(lines: ParcelLine[]): number {
    const raw = lines.reduce(
      (sum, line) =>
        sum + (line.weightGram || DEFAULT_ITEM_WEIGHT_GRAM) * line.quantity,
      0,
    );
    return Math.min(
      MAX_PARCEL_WEIGHT_GRAM,
      Math.max(MIN_PARCEL_WEIGHT_GRAM, raw),
    );
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }
    return customer;
  }
}
