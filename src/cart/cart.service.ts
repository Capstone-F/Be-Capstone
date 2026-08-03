import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { RedisClientType } from 'redis';
import { In, Repository } from 'typeorm';
import { OrderSource } from '../commerce/enums';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RecommendationService } from '../recommendations/recommendation.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Customer } from '../users/customer.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartConflictDto, CartResponseDto } from './dto/cart-response.dto';
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
    @InjectRepository(ProductProtocol)
    private readonly productProtocolRepository: Repository<ProductProtocol>,
    @InjectRepository(IngredientConflict)
    private readonly ingredientConflictRepository: Repository<IngredientConflict>,
    private readonly recommendationService: RecommendationService,
  ) {}

  async getCart(userId: string): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = await this.loadCart(customer.id);
    return this.toResponse(cart);
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
        // Ensure the locked recommendation still belongs to this customer.
        await this.recommendationService.getByIdForCustomer(
          cart.surveyRecommendationId!,
          customer.id,
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
    return this.toResponse(cart);
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
    return this.toResponse(cart);
  }

  async clearCart(userId: string): Promise<CartResponseDto> {
    const customer = await this.requireCustomer(userId);
    const cart = emptyCart();
    await this.saveCart(customer.id, cart);
    return this.toResponse(cart);
  }

  /** Used by OrdersService — returns cart without requiring user session remap. */
  async getCartByCustomerId(customerId: string): Promise<CartState> {
    return this.loadCart(customerId);
  }

  async clearCartByCustomerId(customerId: string): Promise<void> {
    await this.saveCart(customerId, emptyCart());
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

  private async toResponse(cart: CartState): Promise<CartResponseDto> {
    return {
      source: cart.source,
      surveyRecommendationId: cart.surveyRecommendationId,
      items: cart.items,
      conflicts: await this.resolveConflicts(cart),
    };
  }

  private async resolveConflicts(cart: CartState): Promise<CartConflictDto[]> {
    if (cart.items.length === 0) {
      return [];
    }

    const variantIds = cart.items.map((i) => i.productVariantId);
    const variants = await this.variantRepository.find({
      where: { id: In(variantIds) },
    });
    if (variants.length === 0) {
      return [];
    }

    const productIdByVariantId = new Map(
      variants.map((v) => [v.id, v.productId]),
    );
    const productIds = [...new Set(variants.map((v) => v.productId))];

    const mappings = await this.productProtocolRepository.find({
      where: { productId: In(productIds) },
      relations: ['protocol'],
    });
    if (mappings.length === 0) {
      return [];
    }

    const variantIdsByProtocolId = new Map<string, string[]>();
    for (const mapping of mappings) {
      const relatedVariantIds = variantIds.filter(
        (id) => productIdByVariantId.get(id) === mapping.productId,
      );
      if (relatedVariantIds.length === 0) continue;
      const existing = variantIdsByProtocolId.get(mapping.protocolId) ?? [];
      for (const id of relatedVariantIds) {
        if (!existing.includes(id)) {
          existing.push(id);
        }
      }
      variantIdsByProtocolId.set(mapping.protocolId, existing);
    }

    const protocolIds = [...variantIdsByProtocolId.keys()];
    if (protocolIds.length === 0) {
      return [];
    }

    const conflicts = await this.ingredientConflictRepository.find({
      where: {
        protocolId: In(protocolIds),
        conflictingProtocolId: In(protocolIds),
      },
      relations: ['protocol', 'conflictingProtocol'],
    });

    const resolved: CartConflictDto[] = [];
    for (const conflict of conflicts) {
      const productVariantIds =
        variantIdsByProtocolId.get(conflict.protocolId) ?? [];
      const conflictingProductVariantIds =
        variantIdsByProtocolId.get(conflict.conflictingProtocolId) ?? [];
      if (
        productVariantIds.length === 0 ||
        conflictingProductVariantIds.length === 0
      ) {
        continue;
      }
      resolved.push({
        protocolCode: conflict.protocol?.code ?? conflict.protocolId,
        conflictingProtocolCode:
          conflict.conflictingProtocol?.code ?? conflict.conflictingProtocolId,
        severity: conflict.severity,
        description: conflict.description ?? conflict.reason ?? '',
        reason: conflict.reason,
        productVariantIds,
        conflictingProductVariantIds,
      });
    }
    return resolved;
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
