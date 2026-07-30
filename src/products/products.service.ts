import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { ListProductCategoriesQueryDto } from './dto/list-product-categories.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { ProductCategoryResponseDto } from './dto/product-category-response.dto';
import {
  PaginatedProductsDto,
  ProductDetailResponseDto,
  ProductIngredientResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
} from './dto/product-response.dto';
import {
  SuggestedProductsResponseDto,
  SuggestProductsQueryDto,
} from './dto/suggest-products.dto';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductProtocol } from './product-protocol.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';
import { buildIlikePattern } from './utils/ilike.util';

const ALLERGY_INGREDIENT_ALIASES: Record<string, string[]> = {
  FRAGRANCE: ['FRAGRANCE', 'PARFUM'],
  ALCOHOL: ['ALCOHOL', 'ETHANOL'],
  ESSENTIAL_OIL: ['ESSENTIAL_OIL'],
  LANOLIN: ['LANOLIN'],
  SALICYLIC_ACID: ['SALICYLIC_ACID'],
  BENZOYL_PEROXIDE: ['BENZOYL_PEROXIDE'],
  RETINOIDS: ['RETINOID', 'RETINOL', 'RETINAL', 'TRETINOIN', 'ADAPALENE'],
  VITAMIN_C: ['VITAMIN_C', 'ASCORBIC_ACID'],
  NIACINAMIDE: ['NIACINAMIDE'],
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductIngredient)
    private readonly productIngredientRepository: Repository<ProductIngredient>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    @InjectRepository(ProductProtocol)
    private readonly productProtocolRepository: Repository<ProductProtocol>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  async findOne(id: string): Promise<ProductDetailResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['brand', 'category', 'variants'],
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const mappings = await this.productIngredientRepository.find({
      where: { productId: id },
      relations: ['ingredient'],
      order: { isKeyIngredient: 'DESC', ingredient: { name: 'ASC' } },
    });

    return this.toDetailResponse(product, mappings);
  }

  async updateVariantImage(
    variantId: string,
    imageUrl: string,
  ): Promise<ProductVariantResponseDto> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException(`Product variant ${variantId} not found`);
    }

    variant.imageUrl = imageUrl.trim();
    const saved = await this.variantRepository.save(variant);

    return {
      id: saved.id,
      sku: saved.sku,
      volume: saved.volume,
      packaging: saved.packaging,
      priceVnd: saved.priceVnd,
      isActive: saved.isActive,
      imageUrl: saved.imageUrl ?? null,
    };
  }

  async findMany(query: ListProductsQueryDto): Promise<PaginatedProductsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .where('product.isActive = :isActive', { isActive: true });

    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: query.brandId });
    }

    if (query.brandName?.trim()) {
      qb.andWhere('brand.name ILIKE :brandName', {
        brandName: `%${query.brandName.trim()}%`,
      });
    }

    if (query.ingredientName?.trim()) {
      qb.innerJoin('product.productIngredients', 'pi')
        .innerJoin('pi.ingredient', 'ingredient')
        .andWhere('ingredient.name ILIKE :ingredientName', {
          ingredientName: `%${query.ingredientName.trim()}%`,
        });
    }

    const ILIKE = "ILIKE :queryTerm ESCAPE '\\'";
    const queryTerm = buildIlikePattern(query.query ?? '');
    if (queryTerm) {
      qb.leftJoin('product.productIngredients', 'queryPi')
        .leftJoin('queryPi.ingredient', 'queryIngredient')
        .andWhere(
          new Brackets((sub) => {
            sub
              .where(`product.name ${ILIKE}`, { queryTerm })
              .orWhere(`product.description ${ILIKE}`, { queryTerm })
              .orWhere(`brand.name ${ILIKE}`, { queryTerm })
              .orWhere(`category.name ${ILIKE}`, { queryTerm })
              .orWhere(`category.code ${ILIKE}`, { queryTerm })
              .orWhere(`queryIngredient.name ${ILIKE}`, { queryTerm })
              .orWhere(`variants.sku ${ILIKE}`, { queryTerm });
          }),
        );
    }

    qb.orderBy('product.createdAt', 'DESC').skip(skip).take(limit);

    const [products, total] = await qb.getManyAndCount();

    const items = await Promise.all(
      products.map(async (product) => {
        const mappings = await this.productIngredientRepository.find({
          where: { productId: product.id },
          relations: ['ingredient'],
          order: { isKeyIngredient: 'DESC', ingredient: { name: 'ASC' } },
        });
        return this.toDetailResponse(product, mappings);
      }),
    );

    return { items, total, page, limit };
  }

  async suggestForUser(
    userId: string,
    query: SuggestProductsQueryDto,
  ): Promise<SuggestedProductsResponseDto> {
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }

    const [context, allergies] = await Promise.all([
      this.ruleEngine.buildContextFromProfile(customer.id),
      this.customerAllergyRepository.find({
        where: { customerId: customer.id },
        relations: ['label'],
      }),
    ]);

    if (context.protocols.length === 0) {
      return { items: [], total: 0, limit };
    }

    const scoreByProtocolId = new Map(
      context.protocols.map((protocol) => [protocol.id, protocol.matchScore]),
    );
    const productProtocols = await this.productProtocolRepository.find({
      where: { protocolId: In([...scoreByProtocolId.keys()]) },
      relations: [
        'product',
        'product.brand',
        'product.category',
        'product.variants',
        'product.productIngredients',
        'product.productIngredients.ingredient',
      ],
    });
    const allergyCodes = new Set(
      allergies
        .filter((allergy) => allergy.label?.isActive)
        .map((allergy) => allergy.label.code),
    );

    const candidates = new Map<
      string,
      { product: Product; matchScore: number }
    >();
    for (const mapping of productProtocols) {
      const product = mapping.product;
      const matchScore = scoreByProtocolId.get(mapping.protocolId);
      if (
        !product?.isActive ||
        matchScore === undefined ||
        !(product.variants ?? []).some((variant) => variant.isActive) ||
        this.hasAllergicIngredient(
          product.productIngredients ?? [],
          allergyCodes,
        )
      ) {
        continue;
      }

      const existing = candidates.get(product.id);
      if (!existing || matchScore > existing.matchScore) {
        candidates.set(product.id, { product, matchScore });
      }
    }

    const ranked = [...candidates.values()].sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.product.name.localeCompare(b.product.name) ||
        a.product.id.localeCompare(b.product.id),
    );
    const items = ranked.slice(0, limit).map(({ product }) => {
      const activeProduct = {
        ...product,
        variants: (product.variants ?? []).filter(
          (variant) => variant.isActive,
        ),
      };
      return this.toDetailResponse(
        activeProduct,
        product.productIngredients ?? [],
      );
    });

    return { items, total: ranked.length, limit };
  }

  async findCategories(
    query: ListProductCategoriesQueryDto,
  ): Promise<ProductCategoryResponseDto[]> {
    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true });

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(category.name ILIKE :term OR category.code ILIKE :term)', {
        term,
      });
    }

    const categories = await qb.orderBy('category.name', 'ASC').getMany();

    return categories.map((category) => this.toCategoryResponse(category));
  }

  private toCategoryResponse(
    category: ProductCategory,
  ): ProductCategoryResponseDto {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private hasAllergicIngredient(
    mappings: ProductIngredient[],
    allergyCodes: Set<string>,
  ): boolean {
    if (allergyCodes.size === 0) {
      return false;
    }

    return mappings.some((mapping) => {
      const ingredientCode = this.normalizeIngredientName(
        mapping.ingredient?.name ?? '',
      );
      return [...allergyCodes].some((allergyCode) => {
        const aliases = ALLERGY_INGREDIENT_ALIASES[allergyCode] ?? [
          allergyCode,
        ];
        return aliases.some(
          (alias) => ingredientCode === alias || ingredientCode.includes(alias),
        );
      });
    });
  }

  private normalizeIngredientName(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private toDetailResponse(
    product: Product,
    mappings: ProductIngredient[],
  ): ProductDetailResponseDto {
    const variants: ProductVariantResponseDto[] = (product.variants ?? []).map(
      (v) => ({
        id: v.id,
        sku: v.sku,
        volume: v.volume,
        packaging: v.packaging,
        priceVnd: v.priceVnd,
        isActive: v.isActive,
        imageUrl: v.imageUrl ?? null,
      }),
    );

    const productDto: ProductResponseDto = {
      id: product.id,
      name: product.name,
      brandId: product.brandId,
      brandName: product.brand?.name ?? '',
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? '',
      description: product.description,
      isActive: product.isActive,
      variants,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };

    const ingredients: ProductIngredientResponseDto[] = mappings.map((m) => ({
      name: m.ingredient.name,
      concentrationPct:
        m.concentrationPct !== null ? Number(m.concentrationPct) : null,
      isKeyIngredient: m.isKeyIngredient,
    }));

    return { product: productDto, ingredients };
  }
}
