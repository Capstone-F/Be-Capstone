import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { RedisClientType } from 'redis';
import { Repository } from 'typeorm';
import { OrderSource } from '../commerce/enums';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Customer } from '../users/customer.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { CartState, emptyCart } from './cart.types';

const CART_TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class CartService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly recommendationService: RecommendationService,
  ) {}

  async getCart(userId: string): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.loadCart(customer.id);
    return cart;
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.loadCart(customer.id);

    const variant = await this.variantRepository.findOne({
      where: { id: dto.productVariantId, isActive: true },
    });
    if (!variant) {
      throw new NotFoundException(
        `Product variant ${dto.productVariantId} not found`,
      );
    }

    if (cart.items.length === 0) {
      cart.source = dto.source;
      if (dto.source === OrderSource.SURVEY) {
        if (!dto.surveyRecommendationId) {
          throw new BadRequestException(
            'surveyRecommendationId is required for SURVEY carts',
          );
        }
        const recommendation =
          await this.recommendationService.getByIdForCustomer(
            dto.surveyRecommendationId,
            customer.id,
          );
        this.assertVariantInRecommendation(
          dto.productVariantId,
          recommendation.items.map((i) => i.productVariantId),
        );
        cart.surveyRecommendationId = recommendation.id;
      } else {
        cart.surveyRecommendationId = null;
      }
    } else {
      if (cart.source !== dto.source) {
        throw new BadRequestException(
          `Cannot mix ${cart.source} and ${dto.source} items in the same cart`,
        );
      }
      if (cart.source === OrderSource.SURVEY) {
        if (
          dto.surveyRecommendationId &&
          dto.surveyRecommendationId !== cart.surveyRecommendationId
        ) {
          throw new BadRequestException(
            'Cart is locked to a different survey recommendation',
          );
        }
        const recommendation =
          await this.recommendationService.getByIdForCustomer(
            cart.surveyRecommendationId!,
            customer.id,
          );
        this.assertVariantInRecommendation(
          dto.productVariantId,
          recommendation.items.map((i) => i.productVariantId),
        );
      }
    }

    const existing = cart.items.find(
      (i) => i.productVariantId === dto.productVariantId,
    );
    if (existing) {
      existing.quantity = dto.quantity;
    } else {
      cart.items.push({
        productVariantId: dto.productVariantId,
        quantity: dto.quantity,
      });
    }

    await this.saveCart(customer.id, cart);
    return cart;
  }

  async removeItem(
    userId: string,
    productVariantId: string,
  ): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.loadCart(customer.id);
    cart.items = cart.items.filter(
      (i) => i.productVariantId !== productVariantId,
    );
    if (cart.items.length === 0) {
      Object.assign(cart, emptyCart());
    }
    await this.saveCart(customer.id, cart);
    return cart;
  }

  async clearCart(userId: string): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = emptyCart();
    await this.saveCart(customer.id, cart);
    return cart;
  }

  /** Used by OrdersService — returns cart without requiring user session remap. */
  async getCartByCustomerId(customerId: string): Promise<CartState> {
    return this.loadCart(customerId);
  }

  async clearCartByCustomerId(customerId: string): Promise<void> {
    await this.saveCart(customerId, emptyCart());
  }

  private assertVariantInRecommendation(
    productVariantId: string,
    allowedVariantIds: string[],
  ): void {
    if (!allowedVariantIds.includes(productVariantId)) {
      throw new BadRequestException(
        'Only recommended products from the survey can be added to a SURVEY cart',
      );
    }
  }

  private cartKey(customerId: string): string {
    return `cart:${customerId}`;
  }

  private async loadCart(customerId: string): Promise<CartState> {
    const raw = await this.redis.get(this.cartKey(customerId));
    if (!raw) {
      return emptyCart();
    }
    try {
      const parsed = JSON.parse(raw) as CartState;
      return {
        source: parsed.source ?? null,
        surveyRecommendationId: parsed.surveyRecommendationId ?? null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return emptyCart();
    }
  }

  private async saveCart(customerId: string, cart: CartState): Promise<void> {
    await this.redis.set(this.cartKey(customerId), JSON.stringify(cart), {
      EX: CART_TTL_SECONDS,
    });
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
