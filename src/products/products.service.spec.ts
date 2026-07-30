import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductProtocol } from './product-protocol.entity';
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
      imageUrl: null,
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
  leftJoin: jest.Mock;
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
  leftJoin: jest.fn().mockReturnThis(),
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
  leftJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getMany: jest.fn().mockResolvedValue(categories),
});

const emptySuggestionDependencies = [
  {} as Repository<ProductProtocol>,
  {} as Repository<Customer>,
  {} as Repository<CustomerAllergy>,
  {} as RuleEngineService,
] as const;

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
      ...emptySuggestionDependencies,
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
      ...emptySuggestionDependencies,
    );

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should update variant imageUrl', async () => {
    const variant = {
      id: 'variant-1',
      sku: 'LRP-EFFAC-30',
      volume: '30ml',
      packaging: null,
      priceVnd: 650000,
      isActive: true,
      imageUrl: null,
    };
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue(variant),
      save: jest.fn().mockImplementation(async (v) => v),
    } as unknown as Repository<ProductVariant>;
    const service = new ProductsService(
      {} as Repository<Product>,
      variantRepo,
      {} as Repository<ProductIngredient>,
      {} as Repository<ProductCategory>,
      ...emptySuggestionDependencies,
    );

    const result = await service.updateVariantImage(
      'variant-1',
      'https://placehold.co/400',
    );

    expect(result.imageUrl).toBe('https://placehold.co/400');
    expect(variantRepo.save).toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating missing variant image', async () => {
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<ProductVariant>;
    const service = new ProductsService(
      {} as Repository<Product>,
      variantRepo,
      {} as Repository<ProductIngredient>,
      {} as Repository<ProductCategory>,
      ...emptySuggestionDependencies,
    );

    await expect(
      service.updateVariantImage('missing', 'https://placehold.co/400'),
    ).rejects.toThrow(NotFoundException);
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
      ...emptySuggestionDependencies,
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

  describe('findMany query search', () => {
    const makeService = (qb: MockQb) => {
      const productRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<Product>;
      const piRepo = {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<ProductIngredient>;
      return new ProductsService(
        productRepo,
        {} as Repository<ProductVariant>,
        piRepo,
        {} as Repository<ProductCategory>,
        ...emptySuggestionDependencies,
      );
    };

    it('should apply query search across product, brand, category, description, ingredient, and SKU', async () => {
      const qb = makeQueryBuilder([makeProduct()]);
      const service = makeService(qb);

      await service.findMany({ query: 'Effaclar' });

      expect(qb.leftJoin).toHaveBeenCalledWith(
        'product.productIngredients',
        'queryPi',
      );
      expect(qb.leftJoin).toHaveBeenCalledWith(
        'queryPi.ingredient',
        'queryIngredient',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Brackets));

      const bracketsCall = qb.andWhere.mock.calls.find(
        ([arg]) => arg instanceof Brackets,
      );
      expect(bracketsCall).toBeDefined();

      const subQb = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
      };
      (bracketsCall![0] as Brackets).whereFactory(subQb as never);

      expect(subQb.where).toHaveBeenCalledWith(
        "product.name ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "product.description ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "brand.name ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "category.name ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "category.code ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "queryIngredient.name ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
      expect(subQb.orWhere).toHaveBeenCalledWith(
        "variants.sku ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%Effaclar%' },
      );
    });

    it('should ignore blank query', async () => {
      const qb = makeQueryBuilder([makeProduct()]);
      const service = makeService(qb);

      await service.findMany({ query: '   ' });

      expect(qb.leftJoin).not.toHaveBeenCalled();
      const bracketsCalls = qb.andWhere.mock.calls.filter(
        ([arg]) => arg instanceof Brackets,
      );
      expect(bracketsCalls).toHaveLength(0);
    });

    it('should combine query with categoryId filter', async () => {
      const qb = makeQueryBuilder([makeProduct()]);
      const service = makeService(qb);

      await service.findMany({ categoryId: 'cat-1', query: 'serum' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'product.categoryId = :categoryId',
        { categoryId: 'cat-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('should escape ILIKE wildcards in query param', async () => {
      const qb = makeQueryBuilder([makeProduct()]);
      const service = makeService(qb);

      await service.findMany({ query: '100%_off' });

      const bracketsCall = qb.andWhere.mock.calls.find(
        ([arg]) => arg instanceof Brackets,
      );
      expect(bracketsCall).toBeDefined();

      const subQb = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
      };
      (bracketsCall![0] as Brackets).whereFactory(subQb as never);

      expect(subQb.where).toHaveBeenCalledWith(
        "product.name ILIKE :queryTerm ESCAPE '\\'",
        { queryTerm: '%100\\%\\_off%' },
      );
    });
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
        ...emptySuggestionDependencies,
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
        ...emptySuggestionDependencies,
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
        ...emptySuggestionDependencies,
      );

      const result = await service.findCategories({ search: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });

  describe('suggestForUser', () => {
    const makeSuggestionService = (options: {
      customer: Customer | null;
      allergies?: CustomerAllergy[];
      protocols?: Array<{ id: string; matchScore: number }>;
      productProtocols?: ProductProtocol[];
    }) => {
      const customerRepository = {
        findOne: jest.fn().mockResolvedValue(options.customer),
      } as unknown as Repository<Customer>;
      const allergyRepository = {
        find: jest.fn().mockResolvedValue(options.allergies ?? []),
      } as unknown as Repository<CustomerAllergy>;
      const productProtocolRepository = {
        find: jest.fn().mockResolvedValue(options.productProtocols ?? []),
      } as unknown as Repository<ProductProtocol>;
      const ruleEngine = {
        buildContextFromProfile: jest.fn().mockResolvedValue({
          customerProfile: null,
          labels: [],
          protocols: options.protocols ?? [],
        }),
      } as unknown as RuleEngineService;

      return new ProductsService(
        {} as Repository<Product>,
        {} as Repository<ProductVariant>,
        {} as Repository<ProductIngredient>,
        {} as Repository<ProductCategory>,
        productProtocolRepository,
        customerRepository,
        allergyRepository,
        ruleEngine,
      );
    };

    it('rejects authenticated users without a customer profile', async () => {
      const service = makeSuggestionService({ customer: null });

      await expect(service.suggestForUser('user-1', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('filters allergy aliases, ranks by best protocol score, and applies limit', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
      } as Customer;
      const retinoidLabel = {
        id: 'label-retinoids',
        code: 'RETINOIDS',
        isActive: true,
      } as CustomerAllergy['label'];
      const allergy = {
        id: 'allergy-1',
        customerId: customer.id,
        customer,
        labelId: retinoidLabel.id,
        label: retinoidLabel,
        createdAt: new Date(),
      } as CustomerAllergy;
      const retinolMapping = {
        ...makeMapping(),
        productId: 'product-retinol',
        ingredient: {
          ...makeMapping().ingredient,
          name: 'Retinol 0.3%',
        },
      };
      const allergicProduct = makeProduct({
        id: 'product-retinol',
        name: 'Retinol Serum',
        productIngredients: [retinolMapping],
      });
      const topProduct = makeProduct({
        id: 'product-top',
        name: 'Barrier Cream',
        productIngredients: [],
      });
      const lowerProduct = makeProduct({
        id: 'product-lower',
        name: 'Hydrating Serum',
        productIngredients: [],
      });
      const productProtocols = [
        {
          id: 'pp-allergic',
          productId: allergicProduct.id,
          protocolId: 'protocol-high',
          product: allergicProduct,
        },
        {
          id: 'pp-top',
          productId: topProduct.id,
          protocolId: 'protocol-medium',
          product: topProduct,
        },
        {
          id: 'pp-lower',
          productId: lowerProduct.id,
          protocolId: 'protocol-low',
          product: lowerProduct,
        },
      ] as ProductProtocol[];
      const service = makeSuggestionService({
        customer,
        allergies: [allergy],
        protocols: [
          { id: 'protocol-high', matchScore: 10 },
          { id: 'protocol-medium', matchScore: 5 },
          { id: 'protocol-low', matchScore: 2 },
        ],
        productProtocols,
      });

      const result = await service.suggestForUser(customer.userId, {
        limit: 1,
      });

      expect(result).toEqual({
        items: [
          expect.objectContaining({
            product: expect.objectContaining({ id: 'product-top' }),
          }),
        ],
        total: 2,
        limit: 1,
      });
    });
  });
});
