import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  name: 'Effaclar Serum',
  brandId: 'brand-1',
  categoryId: 'cat-1',
  description: null,
  isActive: true,
  brand: { id: 'brand-1', name: 'La Roche-Posay' } as Product['brand'],
  category: { id: 'cat-1', name: 'Serum' } as Product['category'],
  variants: [
    {
      id: 'variant-1',
      sku: 'LRP-EFFAC-30',
      volume: '30ml',
      packaging: null,
      priceVnd: 650000,
      isActive: true,
    } as ProductVariant,
  ],
  productIngredients: [],
  productProtocols: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeMapping = (): ProductIngredient => ({
  id: 'pi-1',
  productId: 'product-1',
  ingredientId: 'ing-1',
  concentrationPct: 1.5,
  isKeyIngredient: true,
  product: makeProduct(),
  ingredient: {
    id: 'ing-1',
    name: 'Salicylic Acid',
    ingredientType: 'bha',
    isActiveIngredient: true,
    description: null,
    productIngredients: [],
    protocols: [],
    lockedIngredients: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

type MockQb = {
  where: jest.Mock;
  andWhere: jest.Mock;
  innerJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
  getMany: jest.Mock;
};

const makeQueryBuilder = (products: Product[] = []): MockQb => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([products, products.length]),
  getMany: jest.fn().mockResolvedValue([]),
});

const makeCategory = (
  overrides: Partial<ProductCategory> = {},
): ProductCategory => ({
  id: 'cat-1',
  code: 'SERUM',
  name: 'Serum',
  description: 'Concentrated treatment serums',
  isActive: true,
  products: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeCategoryQueryBuilder = (
  categories: ProductCategory[] = [],
): MockQb => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getMany: jest.fn().mockResolvedValue(categories),
});

describe('ProductsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return product detail with ingredients', async () => {
    const productRepo = {
      findOne: jest.fn().mockResolvedValue(makeProduct()),
    } as unknown as Repository<Product>;
    const variantRepo = {} as unknown as Repository<ProductVariant>;
    const piRepo = {
      find: jest.fn().mockResolvedValue([makeMapping()]),
    } as unknown as Repository<ProductIngredient>;
    const categoryRepo = {} as unknown as Repository<ProductCategory>;
    const service = new ProductsService(
      productRepo,
      variantRepo,
      piRepo,
      categoryRepo,
    );

    const result = await service.findOne('product-1');

    expect(result.product.id).toBe('product-1');
    expect(result.product.brandName).toBe('La Roche-Posay');
    expect(result.product.variants).toHaveLength(1);
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0]).toEqual({
      name: 'Salicylic Acid',
      concentrationPct: 1.5,
      isKeyIngredient: true,
    });
  });

  it('should throw NotFoundException when product does not exist', async () => {
    const productRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<Product>;
    const variantRepo = {} as unknown as Repository<ProductVariant>;
    const piRepo = {} as unknown as Repository<ProductIngredient>;
    const categoryRepo = {} as unknown as Repository<ProductCategory>;
    const service = new ProductsService(
      productRepo,
      variantRepo,
      piRepo,
      categoryRepo,
    );

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should apply category, brand, and ingredient filters in QueryBuilder', async () => {
    const qb = makeQueryBuilder([makeProduct()]);
    const productRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<Product>;
    const variantRepo = {} as unknown as Repository<ProductVariant>;
    const piRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<ProductIngredient>;
    const categoryRepo = {} as unknown as Repository<ProductCategory>;
    const service = new ProductsService(
      productRepo,
      variantRepo,
      piRepo,
      categoryRepo,
    );

    await service.findMany({
      categoryId: 'cat-1',
      brandId: 'brand-1',
      brandName: 'La Roche',
      ingredientName: 'Niacinamide',
      page: 2,
      limit: 10,
    });

    expect(productRepo.createQueryBuilder).toHaveBeenCalledWith('product');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'product.categoryId = :categoryId',
      {
        categoryId: 'cat-1',
      },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('product.brandId = :brandId', {
      brandId: 'brand-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('brand.name ILIKE :brandName', {
      brandName: '%La Roche%',
    });
    expect(qb.innerJoin).toHaveBeenCalledWith(
      'product.productIngredients',
      'pi',
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'ingredient.name ILIKE :ingredientName',
      { ingredientName: '%Niacinamide%' },
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  describe('findCategories', () => {
    it('should return mapped active categories ordered by name', async () => {
      const categories = [
        makeCategory({ id: 'cat-1', code: 'CLEANSER', name: 'Cleanser' }),
        makeCategory({ id: 'cat-2', code: 'SERUM', name: 'Serum' }),
      ];
      const qb = makeCategoryQueryBuilder(categories);
      const categoryRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<ProductCategory>;
      const service = new ProductsService(
        {} as Repository<Product>,
        {} as Repository<ProductVariant>,
        {} as Repository<ProductIngredient>,
        categoryRepo,
      );

      const result = await service.findCategories({});

      expect(categoryRepo.createQueryBuilder).toHaveBeenCalledWith('category');
      expect(qb.where).toHaveBeenCalledWith('category.isActive = :isActive', {
        isActive: true,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('category.name', 'ASC');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'cat-1',
        code: 'CLEANSER',
        name: 'Cleanser',
        description: 'Concentrated treatment serums',
        isActive: true,
        createdAt: categories[0].createdAt,
        updatedAt: categories[0].updatedAt,
      });
    });

    it('should apply search filter on name and code', async () => {
      const qb = makeCategoryQueryBuilder([makeCategory()]);
      const categoryRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<ProductCategory>;
      const service = new ProductsService(
        {} as Repository<Product>,
        {} as Repository<ProductVariant>,
        {} as Repository<ProductIngredient>,
        categoryRepo,
      );

      await service.findCategories({ search: 'Serum' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(category.name ILIKE :term OR category.code ILIKE :term)',
        { term: '%Serum%' },
      );
    });

    it('should return empty array when no categories match', async () => {
      const qb = makeCategoryQueryBuilder([]);
      const categoryRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<ProductCategory>;
      const service = new ProductsService(
        {} as Repository<Product>,
        {} as Repository<ProductVariant>,
        {} as Repository<ProductIngredient>,
        categoryRepo,
      );

      const result = await service.findCategories({ search: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });
});
