import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductCategory } from './enums/product-category.enum';
import { ProductIngredient } from './product-ingredient.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  name: 'Effaclar Serum',
  brand: 'La Roche-Posay',
  category: ProductCategory.SERUM,
  description: null,
  priceVnd: 650000,
  stockQuantity: 100,
  isActive: true,
  shelfLifeValue: 365,
  shelfLifeUnit: 'DAY' as Product['shelfLifeUnit'],
  productIngredients: [],
  batches: [],
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
    goalIngredients: [],
    conflictsAsA: [],
    conflictsAsB: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

type MockQb = {
  where: jest.Mock;
  andWhere: jest.Mock;
  innerJoin: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
};

const makeQueryBuilder = (products: Product[] = []): MockQb => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([products, products.length]),
});

describe('ProductsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return product detail with ingredients', async () => {
    const productRepo = {
      findOneBy: jest.fn().mockResolvedValue(makeProduct()),
    } as unknown as Repository<Product>;
    const piRepo = {
      find: jest.fn().mockResolvedValue([makeMapping()]),
    } as unknown as Repository<ProductIngredient>;
    const service = new ProductsService(productRepo, piRepo);

    const result = await service.findOne('product-1');

    expect(result.product.id).toBe('product-1');
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0]).toEqual({
      name: 'Salicylic Acid',
      concentrationPct: 1.5,
      isKeyIngredient: true,
    });
  });

  it('should throw NotFoundException when product does not exist', async () => {
    const productRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<Product>;
    const piRepo = {} as unknown as Repository<ProductIngredient>;
    const service = new ProductsService(productRepo, piRepo);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should apply category, brand, and ingredient filters in QueryBuilder', async () => {
    const qb = makeQueryBuilder([makeProduct()]);
    const productRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<Product>;
    const piRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<ProductIngredient>;
    const service = new ProductsService(productRepo, piRepo);

    await service.findMany({
      category: ProductCategory.SERUM,
      brand: 'La Roche',
      ingredientName: 'Niacinamide',
      page: 2,
      limit: 10,
    });

    expect(productRepo.createQueryBuilder).toHaveBeenCalledWith('product');
    expect(qb.andWhere).toHaveBeenCalledWith('product.category = :category', {
      category: ProductCategory.SERUM,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('product.brand ILIKE :brand', {
      brand: '%La Roche%',
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
});
