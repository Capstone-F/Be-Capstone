import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { ShelfLifeUnit } from '../stock/enums';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductDetailResponseDto } from './dto/product-response.dto';
import { ProductBrand } from './product-brand.entity';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

type NormalizedIngredientInput = {
  name: string;
  concentrationPct?: number;
  isKeyIngredient: boolean;
};

@Injectable()
export class ProductOnboardingService {
  private readonly logger = new Logger(ProductOnboardingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly productsService: ProductsService,
  ) {}

  async onboard(dto: CreateProductDto): Promise<ProductDetailResponseDto> {
    const normalizedIngredients = this.deduplicateIngredients(dto.ingredients);

    const productId = await this.dataSource.transaction(async (manager) => {
      const brand = await this.resolveBrand(manager, dto.brand.trim());
      const category = await this.resolveCategory(
        manager,
        dto.categoryCode.trim(),
        dto.categoryName?.trim(),
      );

      const product = manager.create(Product, {
        name: dto.name.trim(),
        brandId: brand.id,
        categoryId: category.id,
        description: dto.description?.trim() ?? null,
        isActive: true,
      });
      const savedProduct = await manager.save(Product, product);

      const variant = manager.create(ProductVariant, {
        productId: savedProduct.id,
        sku: dto.sku.trim(),
        volume: dto.volume?.trim() ?? null,
        packaging: dto.packaging?.trim() ?? null,
        priceVnd: dto.priceVnd,
        shelfLifeValue: dto.shelfLifeValue ?? 365,
        shelfLifeUnit: dto.shelfLifeUnit ?? ShelfLifeUnit.DAY,
        isActive: true,
        imageUrl: dto.imageUrl?.trim() || null,
      });
      await manager.save(ProductVariant, variant);

      const ingredientMap = await this.resolveIngredients(
        manager,
        normalizedIngredients,
      );

      const mappings = normalizedIngredients.map((input) => {
        const ingredient = ingredientMap.get(input.name.toLowerCase());
        if (!ingredient) {
          throw new BadRequestException(
            `Không thể xác định thành phần: ${input.name}`,
          );
        }
        return manager.create(ProductIngredient, {
          productId: savedProduct.id,
          ingredientId: ingredient.id,
          concentrationPct: input.concentrationPct ?? null,
          isKeyIngredient: input.isKeyIngredient,
        });
      });

      if (mappings.length > 0) {
        await manager.save(ProductIngredient, mappings);
      }

      this.logger.log(
        `Onboarded product ${savedProduct.id} with ${mappings.length} ingredient mapping(s)`,
      );

      return savedProduct.id;
    });

    return this.productsService.findOne(productId);
  }

  private async resolveBrand(
    manager: EntityManager,
    name: string,
  ): Promise<ProductBrand> {
    const existing = await manager.findOne(ProductBrand, {
      where: { name },
    });
    if (existing) {
      return existing;
    }
    return manager.save(
      ProductBrand,
      manager.create(ProductBrand, { name, isActive: true }),
    );
  }

  private async resolveCategory(
    manager: EntityManager,
    code: string,
    name?: string,
  ): Promise<ProductCategory> {
    const existing = await manager.findOne(ProductCategory, {
      where: { code },
    });
    if (existing) {
      return existing;
    }
    return manager.save(
      ProductCategory,
      manager.create(ProductCategory, {
        code,
        name: name ?? code,
        isActive: true,
      }),
    );
  }

  private deduplicateIngredients(
    ingredients: CreateProductDto['ingredients'],
  ): NormalizedIngredientInput[] {
    const seen = new Map<string, NormalizedIngredientInput>();

    for (const item of ingredients) {
      const trimmedName = item.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('Tên thành phần không được để trống');
      }

      const key = trimmedName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          name: trimmedName,
          concentrationPct: item.concentrationPct,
          isKeyIngredient: item.isKeyIngredient ?? false,
        });
      }
    }

    return [...seen.values()];
  }

  private async resolveIngredients(
    manager: EntityManager,
    inputs: NormalizedIngredientInput[],
  ): Promise<Map<string, Ingredient>> {
    const lowerNames = inputs.map((i) => i.name.toLowerCase());
    const existing = await manager
      .createQueryBuilder(Ingredient, 'ingredient')
      .where('LOWER(ingredient.name) IN (:...names)', { names: lowerNames })
      .getMany();

    const map = new Map<string, Ingredient>();
    for (const ingredient of existing) {
      map.set(ingredient.name.toLowerCase(), ingredient);
    }

    const missing = inputs.filter((i) => !map.has(i.name.toLowerCase()));
    if (missing.length > 0) {
      const created = await manager.save(
        Ingredient,
        missing.map((input) =>
          manager.create(Ingredient, {
            name: input.name,
            isActiveIngredient: true,
          }),
        ),
      );
      for (const ingredient of created) {
        map.set(ingredient.name.toLowerCase(), ingredient);
      }
    }

    return map;
  }
}
