import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { Customer } from '../users/customer.entity';
import { CommerceSetting } from './commerce-setting.entity';
import {
  ComboDiscountSettingDto,
  UpdateComboDiscountDto,
} from './dto/commerce-setting.dto';
import { OrderResponseDto } from './dto/order-response.dto';
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
    private readonly cartService: CartService,
    private readonly recommendationService: RecommendationService,
    private readonly dataSource: DataSource,
  ) {}

  async createFromCart(userId: string): Promise<OrderResponseDto> {
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
        recommendation.items.map((i) => i.productVariantId),
      );
      for (const item of cart.items) {
        if (!allowed.has(item.productVariantId)) {
          throw new BadRequestException(
            'Cart contains products not in the survey recommendation',
          );
        }
      }
      for (const recItem of recommendation.items) {
        recommendationItemByVariant.set(recItem.productVariantId, recItem.id);
      }

      const cartVariantSet = new Set(cart.items.map((i) => i.productVariantId));
      const allRecommendedPurchased = recommendation.items.every((ri) =>
        cartVariantSet.has(ri.productVariantId),
      );
      if (allRecommendedPurchased) {
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
    const totalVnd = Math.max(0, subtotalVnd - discountVnd);

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
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return this.toDto(order);
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
      totalVnd: order.totalVnd,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        surveyRecommendationItemId: item.surveyRecommendationItemId,
      })),
      createdAt: order.createdAt,
    };
  }
}
