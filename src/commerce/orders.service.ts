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
    private readonly cartService: CartService,
    private readonly recommendationService: RecommendationService,
    private readonly deliveryService: DeliveryService,
    private readonly dataSource: DataSource,
  ) {}

  async createFromCart(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.cartService.getCartByCustomerId(customer.id);

    if (!cart.source || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const variantIds = cart.items.map((i) => i.productVariantId);
    const variants = await this.variantRepository.find({
      where: { id: In(variantIds), isActive: true },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more cart variants are invalid');
    }
    const variantById = new Map(variants.map((v) => [v.id, v]));

    let customerSurveyId: string | null = null;
    let surveyRecommendationId: string | null = null;
    let discountVnd = 0;
    let discountType: OrderDiscountType | null = null;
    const recommendationItemByVariant = new Map<string, string>();

    if (cart.source === OrderSource.SURVEY) {
      if (!cart.surveyRecommendationId) {
        throw new BadRequestException(
          'SURVEY cart is missing surveyRecommendationId',
        );
      }
      const recommendation =
        await this.recommendationService.getByIdForCustomer(
          cart.surveyRecommendationId,
          customer.id,
        );
      customerSurveyId = recommendation.customerSurveyId;
      surveyRecommendationId = recommendation.id;

      const allowed = new Set(
        this.recommendationService.getAllowedVariantIds(recommendation),
      );
      for (const item of cart.items) {
        if (!allowed.has(item.productVariantId)) {
          throw new BadRequestException(
            'Cart contains products not in the survey recommendation',
          );
        }
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

      const cartVariantIds = cart.items.map((i) => i.productVariantId);
      if (
        this.recommendationService.isProtocolCoverageComplete(
          recommendation,
          cartVariantIds,
        )
      ) {
        const percent = await this.getComboDiscountPercent();
        const subtotalPreview = cart.items.reduce((sum, item) => {
          const variant = variantById.get(item.productVariantId)!;
          return sum + variant.priceVnd * item.quantity;
        }, 0);
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
        'GHN delivery provider is not configured — run the seed',
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
          subtotalVnd,
          discountVnd,
          discountType,
          shippingFeeVnd,
          totalVnd,
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

  async getOrderForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.orderRepository.findOne({
      where: { id: orderId, customerId: customer.id },
      relations: ['items', 'delivery'],
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
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
      relations: ['items', 'delivery'],
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
    const percent = await this.getComboDiscountPercent();
    return {
      key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
      percent,
    };
  }

  async updateComboDiscountSetting(
    userId: string,
    dto: UpdateComboDiscountDto,
  ): Promise<ComboDiscountSettingDto> {
    let setting = await this.settingRepository.findOneBy({
      key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
    });
    if (!setting) {
      setting = this.settingRepository.create({
        key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
        value: String(dto.percent),
        updatedByUserId: userId,
      });
    } else {
      setting.value = String(dto.percent);
      setting.updatedByUserId = userId;
    }
    await this.settingRepository.save(setting);
    return {
      key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
      percent: dto.percent,
    };
  }

  private async getComboDiscountPercent(): Promise<number> {
    const setting = await this.settingRepository.findOneBy({
      key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
    });
    const parsed = Number.parseFloat(setting?.value ?? '10');
    if (Number.isNaN(parsed) || parsed < 0) {
      return 10;
    }
    return Math.min(100, parsed);
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

  private toDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      status: order.status,
      source: order.source,
      customerSurveyId: order.customerSurveyId,
      surveyRecommendationId: order.surveyRecommendationId,
      subtotalVnd: order.subtotalVnd,
      discountVnd: order.discountVnd,
      discountType: order.discountType,
      shippingFeeVnd: order.shippingFeeVnd,
      totalVnd: order.totalVnd,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        surveyRecommendationItemId: item.surveyRecommendationItemId,
      })),
      provinceId: order.delivery?.provinceId ?? null,
      districtId: order.delivery?.districtId ?? null,
      wardCode: order.delivery?.wardCode ?? null,
      createdAt: order.createdAt,
    };
  }
}
