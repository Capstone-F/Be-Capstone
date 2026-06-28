import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { ShelfLifeUnit } from '../stock/enums';
import { ProductOnboardingService } from './product-onboarding.service';
import { ProductBrand } from './product-brand.entity';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductVariant } from './product-variant.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

type MockManager = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const makeQueryBuilder = (ingredients: Ingredient[] = []) => ({
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(ingredients),
});

const makeManager = (overrides: Partial<MockManager> = {}): MockManager => {
  const qb = makeQueryBuilder();
  return {
    create: jest.fn().mockImplementation((entity, data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity, data) => {
      if (Array.isArray(data)) {
        return Promise.resolve(
          data.map((item, index) => ({
            ...item,
            id: item.id ?? `saved-${index}`,
          })),
        );
      }
      return Promise.resolve({ ...data, id: data.id ?? 'product-1' });
    }),
    findOne: jest.fn().mockImplementation((entity, opts) => {
      if (entity === ProductBrand) {
        return Promise.resolve({ id: 'brand-1', name: opts.where.name });
      }
      if (entity === ProductCategory) {
        return Promise.resolve({ id: 'cat-1', code: opts.where.code });
      }
      return Promise.resolve(null);
    }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    ...overrides,
  };
};

const makeProductsService = (
  overrides: Partial<ProductsService> = {},
): ProductsService =>
  ({
    findOne: jest.fn().mockResolvedValue({
      product: { id: 'product-1', name: 'Test Product' },
      ingredients: [],
    }),
    ...overrides,
  }) as unknown as ProductsService;

const baseDto = {
  name: 'La Roche-Posay Effaclar Serum',
  brand: 'La Roche-Posay',
  categoryCode: 'SERUM',
  categoryName: 'Serum',
  sku: 'LRP-EFFAC-30',
  priceVnd: 650000,
  shelfLifeValue: 365,
  shelfLifeUnit: ShelfLifeUnit.DAY,
  ingredients: [
    { name: 'Salicylic Acid', concentrationPct: 1.5, isKeyIngredient: true },
    { name: 'Niacinamide', concentrationPct: 2 },
  ],
};

describe('ProductOnboardingService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should onboard product with variant and ingredients in a transaction', async () => {
    const manager = makeManager();
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    } as unknown as DataSource;
    const productsService = makeProductsService();
    const service = new ProductOnboardingService(dataSource, productsService);

    const result = await service.onboard(baseDto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(
      Product,
      expect.objectContaining({
        name: baseDto.name,
        brandId: 'brand-1',
        categoryId: 'cat-1',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      ProductVariant,
      expect.objectContaining({
        sku: baseDto.sku,
        priceVnd: baseDto.priceVnd,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      ProductIngredient,
      expect.any(Array),
    );
    expect(productsService.findOne).toHaveBeenCalledWith('product-1');
    expect(result.product.id).toBe('product-1');
  });

  it('should auto-create only missing ingredients', async () => {
    const existingIngredient: Ingredient = {
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
    };

    const qb = makeQueryBuilder([existingIngredient]);
    const manager = makeManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    } as unknown as DataSource;
    const service = new ProductOnboardingService(
      dataSource,
      makeProductsService(),
    );

    await service.onboard(baseDto);

    const ingredientSaves = manager.save.mock.calls.filter(
      ([entity]) => entity === Ingredient,
    );
    expect(ingredientSaves).toHaveLength(1);
    const createdIngredients = ingredientSaves[0][1] as Ingredient[];
    expect(createdIngredients).toHaveLength(1);
    expect(createdIngredients[0].name).toBe('Niacinamide');
  });

  it('should deduplicate repeated ingredient names in payload', async () => {
    const manager = makeManager();
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    } as unknown as DataSource;
    const service = new ProductOnboardingService(
      dataSource,
      makeProductsService(),
    );

    await service.onboard({
      ...baseDto,
      ingredients: [
        { name: 'Niacinamide', concentrationPct: 2 },
        { name: 'niacinamide', concentrationPct: 5 },
        {
          name: 'Salicylic Acid',
          concentrationPct: 1.5,
          isKeyIngredient: true,
        },
      ],
    });

    const mappingSave = manager.save.mock.calls.find(
      ([entity]) => entity === ProductIngredient,
    );
    expect(mappingSave).toBeDefined();
    const mappings = mappingSave![1] as ProductIngredient[];
    expect(mappings).toHaveLength(2);
  });

  it('should propagate transaction errors (rollback)', async () => {
    const manager = makeManager({
      save: jest
        .fn()
        .mockImplementationOnce((entity, data) =>
          Promise.resolve({ ...data, id: 'product-1' }),
        )
        .mockRejectedValueOnce(new Error('DB failure')),
    });
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    } as unknown as DataSource;
    const productsService = makeProductsService();
    const service = new ProductOnboardingService(dataSource, productsService);

    await expect(service.onboard(baseDto)).rejects.toThrow('DB failure');
    expect(productsService.findOne).not.toHaveBeenCalled();
  });

  it('should reject empty ingredient names', async () => {
    const dataSource = {
      transaction: jest.fn(),
    } as unknown as DataSource;
    const service = new ProductOnboardingService(
      dataSource,
      makeProductsService(),
    );

    await expect(
      service.onboard({
        ...baseDto,
        ingredients: [{ name: '   ' }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
