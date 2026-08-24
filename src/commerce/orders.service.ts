import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { DeliveryProvider } from '../delivery/delivery-provider.entity';
import { Delivery } from '../delivery/delivery.entity';
import { DeliveryService } from '../delivery/delivery.service';
import { DeliveryStatus, DeliveryType } from '../delivery/enums';
import { GHN_PROVIDER_CODE } from '../delivery/ghn.constants';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { Role } from '../auth/roles.enum';
import { StockService } from '../stock/stock.service';
import { TreatmentPhase } from '../treatments/treatment-phase.entity';
import { assertTreatmentPhasePurchasable } from '../treatments/treatment-purchase.util';
import { Customer } from '../users/customer.entity';
import { CommerceSetting } from './commerce-setting.entity';
import {
  ComboDiscountSettingDto,
  UpdateComboDiscountDto,
} from './dto/commerce-setting.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderResponseDto, PaginatedOrdersDto } from './dto/order-response.dto';
import {
  CommerceSettingKey,
  OrderDiscountType,
  OrderSource,
  OrderStatus,
} from './enums';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(CommerceSetting)
    private readonly settingRepository: Repository<CommerceSetting>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(DeliveryProvider)
    private readonly deliveryProviderRepository: Repository<DeliveryProvider>,
    @InjectRepository(TreatmentPhase)
    private readonly treatmentPhaseRepository: Repository<TreatmentPhase>,
    private readonly cartService: CartService,
    private readonly recommendationService: RecommendationService,
    private readonly deliveryService: DeliveryService,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
  ) {}

  async createFromCart(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.cartService.getCartByCustomerId(customer.id);

    if (!cart.source || cart.items.length === 0) {
      throw new BadRequestException('Giỏ hàng đang trống');
    }

    const variantIds = cart.items.map((i) => i.productVariantId);
    const variants = await this.variantRepository.find({
      where: { id: In(variantIds), isActive: true },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều phân loại sản phẩm trong giỏ hàng không hợp lệ',
      );
    }
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const availability =
      await this.stockService.getAvailableQuantities(variantIds);
    for (const item of cart.items) {
      const available = availability.get(item.productVariantId) ?? 0;
      if (item.quantity > available) {
        const sku = variantById.get(item.productVariantId)!.sku;
        throw new BadRequestException(
          available <= 0
            ? `Sản phẩm ${sku} đã hết hàng`
            : `Không đủ hàng tồn kho cho sản phẩm ${sku}: còn ${available}, yêu cầu ${item.quantity}`,
        );
      }
    }

    let customerSurveyId: string | null = null;
    let surveyRecommendationId: string | null = null;
    let treatmentPhaseId: string | null = null;
    let discountVnd = 0;
    let discountType: OrderDiscountType | null = null;
    const recommendationItemByVariant = new Map<string, string>();

    const subtotalPreview = cart.items.reduce((sum, item) => {
      const variant = variantById.get(item.productVariantId)!;
      return sum + variant.priceVnd * item.quantity;
    }, 0);

    if (cart.source === OrderSource.SURVEY) {
      if (!cart.surveyRecommendationId) {
        throw new BadRequestException(
          'Giỏ hàng SURVEY thiếu surveyRecommendationId',
        );
      }
      const recommendation =
        await this.recommendationService.getByIdForCustomer(
          cart.surveyRecommendationId,
          customer.id,
        );
      customerSurveyId = recommendation.customerSurveyId;
      surveyRecommendationId = recommendation.id;

      for (const item of cart.items) {
        const recommendationItemId =
          this.recommendationService.findItemIdForVariant(
            recommendation,
            item.productVariantId,
          );
        if (recommendationItemId) {
          recommendationItemByVariant.set(
            item.productVariantId,
            recommendationItemId,
          );
        }
      }

      const minSubtotalVnd = await this.getComboMinSubtotalVnd(
        CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
      );
      if (subtotalPreview > minSubtotalVnd) {
        const percent = await this.getComboDiscountPercent(
          CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
        );
        discountVnd = Math.floor((subtotalPreview * percent) / 100);
        discountType = OrderDiscountType.COMBO;
      }
    }

    if (cart.source === OrderSource.TREATMENT) {
      if (!cart.treatmentPhaseId) {
        throw new BadRequestException(
          'Giỏ hàng TREATMENT thiếu treatmentPhaseId',
        );
      }
      const phase = await this.treatmentPhaseRepository.findOne({
        where: { id: cart.treatmentPhaseId },
        relations: ['treatment'],
      });
      if (!phase) {
        throw new BadRequestException(
          `Không tìm thấy giai đoạn liệu trình ${cart.treatmentPhaseId}`,
        );
      }
      assertTreatmentPhasePurchasable(phase, customer.id);
      treatmentPhaseId = phase.id;

      const minSubtotalVnd = await this.getComboMinSubtotalVnd(
        CommerceSettingKey.TREATMENT_COMBO_MIN_SUBTOTAL_VND,
      );
      if (subtotalPreview > minSubtotalVnd) {
        const percent = await this.getComboDiscountPercent(
          CommerceSettingKey.TREATMENT_COMBO_DISCOUNT_PCT,
        );
        discountVnd = Math.floor((subtotalPreview * percent) / 100);
        discountType = OrderDiscountType.COMBO;
      }
    }

    const subtotalVnd = cart.items.reduce((sum, item) => {
      const variant = variantById.get(item.productVariantId)!;
      return sum + variant.priceVnd * item.quantity;
    }, 0);

    // providerId is NOT NULL with RESTRICT — fail loudly here rather than inside
    // the transaction if the GHN provider row was never seeded.
    const provider = await this.deliveryProviderRepository.findOneBy({
      code: GHN_PROVIDER_CODE,
      isActive: true,
    });
    if (!provider) {
      throw new BadRequestException(
        'Nhà cung cấp giao hàng GHN chưa được cấu hình — hãy chạy seed',
      );
    }

    // Network call to GHN, deliberately outside the transaction below.
    const shippingFeeVnd = await this.deliveryService.quoteFee(
      dto.shippingAddress,
      cart.items.map((item) => ({
        weightGram: variantById.get(item.productVariantId)!.weightGram,
        quantity: item.quantity,
      })),
    );

    // Shipping is added after the discount floor, so a 100% discount still ships.
    const totalVnd = Math.max(0, subtotalVnd - discountVnd) + shippingFeeVnd;

    const order = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(Order, {
          customerId: customer.id,
          status: OrderStatus.PENDING,
          source: cart.source!,
          customerSurveyId,
          surveyRecommendationId,
          treatmentPhaseId,
          subtotalVnd,
          discountVnd,
          discountType,
          shippingFeeVnd,
          totalVnd,
          analyticsSessionId: dto.analyticsSessionId ?? null,
        }),
      );

      await manager.save(
        cart.items.map((item) =>
          manager.create(OrderItem, {
            orderId: created.id,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPriceVnd: variantById.get(item.productVariantId)!.priceVnd,
            lineTotalVnd:
              variantById.get(item.productVariantId)!.priceVnd * item.quantity,
            routineStepDetailsId: null,
            surveyRecommendationItemId:
              recommendationItemByVariant.get(item.productVariantId) ?? null,
          }),
        ),
      );

      const address = dto.shippingAddress;
      await manager.save(
        manager.create(Delivery, {
          orderId: created.id,
          providerId: provider.id,
          type: DeliveryType.STANDARD,
          status: DeliveryStatus.PENDING,
          recipientName: address.recipientName,
          recipientPhone: address.recipientPhone,
          provinceId: address.provinceId,
          districtId: address.districtId,
          wardCode: address.wardCode,
          streetAddress: address.streetAddress,
          // Human-readable snapshot for display/labels; GHN reads the structured columns.
          shippingAddress: `${address.recipientName} (${address.recipientPhone}) — ${address.streetAddress}`,
          shippingFeeVnd,
        }),
      );

      return created;
    });

    await this.cartService.clearCartByCustomerId(customer.id);
    return this.getOrderForUser(userId, order.id);
  }

  async getOrderById(
    auth: { userId: string; roles: string[] },
    orderId: string,
  ): Promise<OrderResponseDto> {
    const isStaffOrAdmin = (auth.roles ?? []).some((r) =>
      [Role.Staff, Role.AppAdmin].includes(r as Role),
    );
    let order: Order | null = null;

    if (isStaffOrAdmin) {
      order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: [
          'items',
          'items.productVariant',
          'items.productVariant.product',
          'delivery',
          'cancellation',
        ],
      });
    } else {
      const customer = await this.requireCustomer(auth.userId);
      order = await this.orderRepository.findOne({
        where: { id: orderId, customerId: customer.id },
        relations: [
          'items',
          'items.productVariant',
          'items.productVariant.product',
          'delivery',
          'cancellation',
        ],
      });
    }

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderId}`);
    }
    return this.toDto(order);
  }

  async getOrderForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    return this.getOrderById({ userId, roles: [Role.Customer] }, orderId);
  }

  /**
   * Staff: re-run stock deduction for a PAID order (typically after restocking a
   * shortfall), then release the held GHN handover once every item is covered.
   * Idempotent — items already deducted are skipped via stockDeductedAt.
   */
  async retryFulfillment(orderId: string): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'items',
        'items.productVariant',
        'items.productVariant.product',
        'delivery',
        'cancellation',
      ],
    });
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderId}`);
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        `Chỉ đơn hàng đã thanh toán mới có thể xử lý tồn kho (trạng thái: ${order.status})`,
      );
    }

    const stillShort: string[] = [];
    for (const item of order.items ?? []) {
      if (item.stockDeductedAt) {
        continue;
      }
      try {
        await this.stockService.deductByVariantId(
          item.productVariantId,
          item.quantity,
          `Order ${order.id} fulfillment retry`,
          item.id,
        );
        item.stockDeductedAt = new Date();
        await this.orderItemRepository.update(
          { id: item.id },
          { stockDeductedAt: item.stockDeductedAt },
        );
      } catch {
        stillShort.push(item.productVariant?.sku ?? item.productVariantId);
      }
    }

    order.stockShortfall = stillShort.length > 0;
    await this.orderRepository.update(
      { id: order.id },
      { stockShortfall: order.stockShortfall },
    );

    if (stillShort.length > 0) {
      throw new BadRequestException(
        `Vẫn thiếu hàng tồn kho cho: ${stillShort.join(', ')}`,
      );
    }

    await this.deliveryService.createGhnOrderForPaidOrder(order.id);
    return this.toDto(order);
  }

  async reorder(userId: string, orderId: string): Promise<OrderResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.orderRepository.findOne({
      where: { id: orderId, customerId: customer.id },
      relations: [
        'items',
        'items.productVariant',
        'items.productVariant.product',
        'delivery',
        'cancellation',
      ],
    });
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng ${orderId}`);
    }

    for (const item of order.items ?? []) {
      try {
        await this.cartService.addItem(userId, {
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          source: OrderSource.CATALOG,
        });
      } catch {
        // Skip any variant that is inactive or conflicting
      }
    }

    return this.toDto(order);
  }

  async listForUser(
    userId: string,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedOrdersDto> {
    const customer = await this.requireCustomer(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Order> = { customerId: customer.id };
    if (query.status) {
      where.status = query.status;
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where,
      relations: ['items', 'delivery', 'cancellation'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items: orders.map((order) => this.toDto(order)),
      total,
      page,
      limit,
    };
  }

  async getComboDiscountSetting(): Promise<ComboDiscountSettingDto> {
    const [percent, minSubtotalVnd] = await Promise.all([
      this.getComboDiscountPercent(),
      this.getComboMinSubtotalVnd(),
    ]);
    return { percent, minSubtotalVnd };
  }

  async updateComboDiscountSetting(
    userId: string,
    dto: UpdateComboDiscountDto,
  ): Promise<ComboDiscountSettingDto> {
    if (dto.percent === undefined && dto.minSubtotalVnd === undefined) {
      throw new BadRequestException(
        'Cần ít nhất một trong hai giá trị percent hoặc minSubtotalVnd',
      );
    }
    if (dto.percent !== undefined) {
      await this.upsertSetting(
        CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
        String(dto.percent),
        userId,
      );
    }
    if (dto.minSubtotalVnd !== undefined) {
      await this.upsertSetting(
        CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
        String(dto.minSubtotalVnd),
        userId,
      );
    }
    return this.getComboDiscountSetting();
  }

  async getTreatmentComboDiscountSetting(): Promise<ComboDiscountSettingDto> {
    const [percent, minSubtotalVnd] = await Promise.all([
      this.getComboDiscountPercent(
        CommerceSettingKey.TREATMENT_COMBO_DISCOUNT_PCT,
      ),
      this.getComboMinSubtotalVnd(
        CommerceSettingKey.TREATMENT_COMBO_MIN_SUBTOTAL_VND,
      ),
    ]);
    return { percent, minSubtotalVnd };
  }

  async updateTreatmentComboDiscountSetting(
    userId: string,
    dto: UpdateComboDiscountDto,
  ): Promise<ComboDiscountSettingDto> {
    if (dto.percent === undefined && dto.minSubtotalVnd === undefined) {
      throw new BadRequestException(
        'Cần ít nhất một trong hai giá trị percent hoặc minSubtotalVnd',
      );
    }
    if (dto.percent !== undefined) {
      await this.upsertSetting(
        CommerceSettingKey.TREATMENT_COMBO_DISCOUNT_PCT,
        String(dto.percent),
        userId,
      );
    }
    if (dto.minSubtotalVnd !== undefined) {
      await this.upsertSetting(
        CommerceSettingKey.TREATMENT_COMBO_MIN_SUBTOTAL_VND,
        String(dto.minSubtotalVnd),
        userId,
      );
    }
    return this.getTreatmentComboDiscountSetting();
  }

  private async upsertSetting(
    key: CommerceSettingKey,
    value: string,
    userId: string,
  ): Promise<void> {
    let setting = await this.settingRepository.findOneBy({ key });
    if (!setting) {
      setting = this.settingRepository.create({
        key,
        value,
        updatedByUserId: userId,
      });
    } else {
      setting.value = value;
      setting.updatedByUserId = userId;
    }
    await this.settingRepository.save(setting);
  }

  private async getComboDiscountPercent(
    key:
      | CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT
      | CommerceSettingKey.TREATMENT_COMBO_DISCOUNT_PCT = CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
  ): Promise<number> {
    const setting = await this.settingRepository.findOneBy({ key });
    const parsed = Number.parseFloat(setting?.value ?? '10');
    if (Number.isNaN(parsed) || parsed < 0) {
      return 10;
    }
    return Math.min(100, parsed);
  }

  private async getComboMinSubtotalVnd(
    key:
      | CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND
      | CommerceSettingKey.TREATMENT_COMBO_MIN_SUBTOTAL_VND = CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
  ): Promise<number> {
    const setting = await this.settingRepository.findOneBy({ key });
    const parsed = Number.parseFloat(setting?.value ?? '300000');
    if (Number.isNaN(parsed) || parsed < 0) {
      return 300000;
    }
    return parsed;
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('Người dùng này không có hồ sơ khách hàng');
    }
    return customer;
  }

  private toDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      status: order.status,
      source: order.source,
      customerSurveyId: order.customerSurveyId,
      surveyRecommendationId: order.surveyRecommendationId,
      treatmentPhaseId: order.treatmentPhaseId,
      subtotalVnd: order.subtotalVnd,
      discountVnd: order.discountVnd,
      discountType: order.discountType,
      shippingFeeVnd: order.shippingFeeVnd,
      totalVnd: order.totalVnd,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        productName:
          item.productVariant?.product?.name ||
          item.productVariant?.sku ||
          'Sản phẩm',
        sku: item.productVariant?.sku || null,
        imageUrl: item.productVariant?.imageUrl || null,
        quantity: item.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        surveyRecommendationItemId: item.surveyRecommendationItemId,
      })),
      provinceId: order.delivery?.provinceId ?? null,
      districtId: order.delivery?.districtId ?? null,
      wardCode: order.delivery?.wardCode ?? null,
      cancelledAt: order.cancelledAt ?? null,
      stockShortfall: order.stockShortfall ?? false,
      cancellation: order.cancellation
        ? {
            id: order.cancellation.id,
            status: order.cancellation.status,
            refundAmountVnd: String(order.cancellation.refundAmountVnd),
            refundTransactionId: order.cancellation.refundTransactionId,
            requiresStockReturn: order.cancellation.requiresStockReturn,
            nextRunAt: order.cancellation.nextRunAt,
          }
        : null,
      createdAt: order.createdAt,
    };
  }
}
