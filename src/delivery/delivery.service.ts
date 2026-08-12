import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { AppConfigService } from '../config/config.service';
import { OrderStatus } from '../commerce/enums';
import { Order } from '../commerce/order.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { Customer } from '../users/customer.entity';
import { Delivery } from './delivery.entity';
import { DeliveryStatusEvent } from './delivery-status-event.entity';
import { DeliveryAdminResponseDto } from './dto/delivery-admin-response.dto';
import { ShippingAddressDto } from './dto/shipping-address.dto';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { FeeQuoteResponseDto } from './dto/fee-quote.dto';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
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

const TERMINAL_HANDOVER_DELIVERY_STATUSES = new Set([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.FAILED,
  DeliveryStatus.RETURNED,
]);

const BLOCKED_HANDOVER_ORDER_STATUSES = new Set([
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

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

    const result = await this.applyProviderStatus({
      delivery,
      providerStatus: body.Status,
      occurredAt: new Date(body.Time),
      rawPayload: rawBody,
    });

    if (!result.applied) {
      return;
    }

    this.logger.log(
      `GHN webhook applied for ${body.OrderCode}: ${body.Status} -> ${result.deliveryStatus}`,
    );
  }

  /**
   * Shared apply path for real GHN webhooks and the sandbox status simulator.
   *
   * Audits every event (applied or not). Stale timestamps are ignored. Order
   * status is never resurrected once CANCELLED/REFUNDED.
   */
  async applyProviderStatus(args: {
    delivery: Delivery;
    providerStatus: string;
    occurredAt: Date;
    rawPayload: unknown;
  }): Promise<{ applied: boolean; deliveryStatus: DeliveryStatus | null }> {
    const { delivery, providerStatus, occurredAt, rawPayload } = args;
    const mapping = GHN_STATUS_MAP[providerStatus];
    const isStale =
      delivery.lastStatusAt !== null && occurredAt <= delivery.lastStatusAt;
    const applied = Boolean(mapping) && !isStale;

    await this.statusEventRepository.save(
      this.statusEventRepository.create({
        deliveryId: delivery.id,
        providerStatus,
        mappedStatus: mapping?.delivery ?? null,
        occurredAt,
        applied,
        rawWebhook: rawPayload,
      }),
    );

    if (!mapping) {
      this.logger.warn(
        `Unmapped provider status=${providerStatus} for delivery ${delivery.id}`,
      );
      return { applied: false, deliveryStatus: null };
    }
    if (isStale) {
      this.logger.log(
        `Stale provider status ${providerStatus} for delivery ${delivery.id} — ignored`,
      );
      return { applied: false, deliveryStatus: null };
    }

    await this.deliveryRepository.update(
      { id: delivery.id },
      {
        status: mapping.delivery,
        providerStatus,
        lastStatusAt: occurredAt,
        ...(mapping.delivery === DeliveryStatus.SHIPPED && !delivery.shippedAt
          ? { shippedAt: occurredAt }
          : {}),
        ...(mapping.delivery === DeliveryStatus.DELIVERED
          ? { deliveredAt: occurredAt }
          : {}),
      },
    );

    // Keep in-memory entity in sync for multi-step simulator advances.
    delivery.status = mapping.delivery;
    delivery.providerStatus = providerStatus;
    delivery.lastStatusAt = occurredAt;
    if (mapping.delivery === DeliveryStatus.SHIPPED && !delivery.shippedAt) {
      delivery.shippedAt = occurredAt;
    }
    if (mapping.delivery === DeliveryStatus.DELIVERED) {
      delivery.deliveredAt = occurredAt;
    }

    if (mapping.order) {
      await this.orderRepository.update(
        {
          id: delivery.orderId,
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.REFUNDED])),
        },
        { status: mapping.order },
      );
    }

    return { applied: true, deliveryStatus: mapping.delivery };
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

  /**
   * Staff confirmation that the parcel was physically handed to the shipping provider.
   *
   * Claims handedOverAt with a conditional UPDATE (single writer), then applies GHN
   * status `picked` through the same path webhooks use — delivery → SHIPPED, order → SHIPPED.
   */
  async confirmHandoverToProvider(
    userId: string,
    orderId: string,
    note?: string,
  ): Promise<DeliveryAdminResponseDto> {
    const delivery = await this.deliveryRepository.findOne({
      where: { orderId },
      relations: ['order'],
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} not found`);
    }

    if (!delivery.providerOrderCode) {
      throw new BadRequestException(
        `Delivery ${delivery.id} has no providerOrderCode — create the GHN order first ` +
          `(POST /admin/deliveries/${delivery.id}/create-ghn-order)`,
      );
    }

    if (delivery.handedOverAt) {
      throw new ConflictException(
        `Order ${orderId} has already been handed over to the carrier`,
      );
    }

    const orderStatus = delivery.order?.status;
    if (orderStatus && BLOCKED_HANDOVER_ORDER_STATUSES.has(orderStatus)) {
      throw new BadRequestException(
        `Cannot hand over order ${orderId} in status ${orderStatus}`,
      );
    }

    if (TERMINAL_HANDOVER_DELIVERY_STATUSES.has(delivery.status)) {
      throw new BadRequestException(
        `Cannot hand over delivery ${delivery.id} in status ${delivery.status}`,
      );
    }

    const handedOverAt = new Date();
    const claim = await this.deliveryRepository.update(
      { id: delivery.id, handedOverAt: IsNull() },
      {
        handedOverAt,
        handedOverByUserId: userId,
        handoverNote: note ?? null,
      },
    );
    if (!claim.affected) {
      throw new ConflictException(
        `Order ${orderId} has already been handed over to the carrier`,
      );
    }

    delivery.handedOverAt = handedOverAt;
    delivery.handedOverByUserId = userId;
    delivery.handoverNote = note ?? null;

    const occurredAt = new Date(
      Math.max(Date.now(), (delivery.lastStatusAt?.getTime() ?? 0) + 1000),
    );

    await this.applyProviderStatus({
      delivery,
      providerStatus: 'picked',
      occurredAt,
      rawPayload: {
        source: 'STAFF_HANDOVER',
        userId,
        note: note ?? null,
        at: occurredAt.toISOString(),
      },
    });

    return this.getForAdmin(delivery.id);
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

    return this.toCustomerDto(delivery);
  }

  async listForAdmin(query: ListDeliveriesQueryDto): Promise<{
    items: DeliveryAdminResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.deliveryRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.statusEvents', 'statusEvents')
      .orderBy('d.createdAt', 'DESC')
      .addOrderBy('statusEvents.occurredAt', 'ASC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }
    if (query.orderId) {
      qb.andWhere('d.orderId = :orderId', { orderId: query.orderId });
    }
    if (query.missingProviderCode === true) {
      qb.andWhere('d.providerOrderCode IS NULL');
    }
    if (query.awaitingHandover === true) {
      qb.andWhere('d.providerOrderCode IS NOT NULL')
        .andWhere('d.handedOverAt IS NULL')
        .andWhere('d.status = :awaitingStatus', {
          awaitingStatus: DeliveryStatus.PROCESSING,
        });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toAdminDto(row)),
      total,
      page,
      limit,
    };
  }

  async getForAdmin(id: string): Promise<DeliveryAdminResponseDto> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ['statusEvents'],
      order: { statusEvents: { occurredAt: 'ASC' } },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${id} not found`);
    }
    return this.toAdminDto(delivery);
  }

  async getEntityById(id: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${id} not found`);
    }
    return delivery;
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

  private toCustomerDto(delivery: Delivery): DeliveryResponseDto {
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

  private toAdminDto(delivery: Delivery): DeliveryAdminResponseDto {
    return {
      ...this.toCustomerDto(delivery),
      providerStatus: delivery.providerStatus,
      lastStatusAt: delivery.lastStatusAt,
      handedOverAt: delivery.handedOverAt,
      handedOverByUserId: delivery.handedOverByUserId,
      handoverNote: delivery.handoverNote,
    };
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
