import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListProductsQueryDto } from './dto/list-products.dto';
import {
  PaginatedProductsDto,
  ProductDetailResponseDto,
  ProductIngredientResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { ProductIngredient } from './product-ingredient.entity';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductIngredient)
    private readonly productIngredientRepository: Repository<ProductIngredient>,
  ) {}

  async findOne(id: string): Promise<ProductDetailResponseDto> {
    const product = await this.productRepository.findOneBy({ id });
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
      .where('product.isActive = :isActive', { isActive: true });

    if (query.category) {
      qb.andWhere('product.category = :category', { category: query.category });
    }

    if (query.brand?.trim()) {
      qb.andWhere('product.brand ILIKE :brand', {
        brand: `%${query.brand.trim()}%`,
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
    const productDto: ProductResponseDto = {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
      priceVnd: product.priceVnd,
      stockQuantity: product.stockQuantity,
      isActive: product.isActive,
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
