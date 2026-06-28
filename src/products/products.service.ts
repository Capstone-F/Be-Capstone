import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListProductsQueryDto } from './dto/list-products.dto';
import {
  PaginatedProductsDto,
  ProductDetailResponseDto,
  ProductIngredientResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
} from './dto/product-response.dto';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductIngredient)
    private readonly productIngredientRepository: Repository<ProductIngredient>,
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
