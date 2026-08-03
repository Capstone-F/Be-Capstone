/**
 * Survey purchase → routine generation integration flow.
 * Uses real TypeORM + Postgres with an in-memory Redis cart.
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.KEYCLOAK_PUBLIC_URL ??= 'http://localhost:8080';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.LLM_PROVIDER ??= 'mock';

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';
import { createInMemoryRedis } from './in-memory-redis';
import { ConfigModule } from '../src/config/config.module';
import { KeycloakAdminModule } from '../src/keycloak/keycloak-admin.module';
import { CartService } from '../src/cart/cart.service';
import { OrdersService } from '../src/commerce/orders.service';
import { DeliveryService } from '../src/delivery/delivery.service';
import { GhnClient } from '../src/delivery/ghn.client';
import { Delivery } from '../src/delivery/delivery.entity';
import { DeliveryProvider } from '../src/delivery/delivery-provider.entity';
import { DeliveryStatusEvent } from '../src/delivery/delivery-status-event.entity';
import {
  CommerceSettingKey,
  OrderDiscountType,
  OrderSource,
  OrderStatus,
} from '../src/commerce/enums';
import { CommerceSetting } from '../src/commerce/commerce-setting.entity';
import { OrderItem } from '../src/commerce/order-item.entity';
import { Order } from '../src/commerce/order.entity';
import { LabelMatchType, TimeOfUse } from '../src/ingredients/enums';
import { Ingredient } from '../src/ingredients/ingredient.entity';
import { IngredientProtocol } from '../src/ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../src/ingredients/protocol-label.entity';
import { LLM_ROUTINE_PROVIDER } from '../src/llm/llm-routine.types';
import { MockLlmRoutineProvider } from '../src/llm/mock-llm-routine.provider';
import { ProductBrand } from '../src/products/product-brand.entity';
import { ProductCategory } from '../src/products/product-category.entity';
import { ProductProtocol } from '../src/products/product-protocol.entity';
import { ProductVariant } from '../src/products/product-variant.entity';
import { Product } from '../src/products/product.entity';
import { RecommendationService } from '../src/recommendations/recommendation.service';
import { SurveyRecommendationItem } from '../src/recommendations/survey-recommendation-item.entity';
import { SurveyRecommendation } from '../src/recommendations/survey-recommendation.entity';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RoutineGeneratorService } from '../src/routines/routine-generator.service';
import { RoutineStepDetails } from '../src/routines/routine-step-details.entity';
import { RoutineStepProtocol } from '../src/routines/routine-step-protocol.entity';
import { RoutineStep } from '../src/routines/routine-step.entity';
import { Routine } from '../src/routines/routine.entity';
import { RuleEngineModule } from '../src/rule-engine/rule-engine.module';
import { AnswerLabel } from '../src/survey/answer-label.entity';
import { Answer } from '../src/survey/answer.entity';
import { CustomerSurvey } from '../src/survey/customer-survey.entity';
import { LabelCategory } from '../src/survey/label-category.entity';
import { Label } from '../src/survey/label.entity';
import { Question } from '../src/survey/question.entity';
import { Customer } from '../src/users/customer.entity';
import { CustomerAllergy } from '../src/users/customer-allergy.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { Role } from '../src/auth/roles.enum';
import { IngredientConflict } from '../src/ingredients/ingredient-conflict.entity';
import { ConflictSeverity } from '../src/products/enums/conflict-severity.enum';
import { StockBatch } from '../src/stock/stock-batch.entity';

describe('Survey purchase → routine generation (e2e)', () => {
  let moduleFixture: TestingModule;
  let dataSource: DataSource;
  let recommendationService: RecommendationService;
  let cartService: CartService;
  let ordersService: OrdersService;
  let deliveryService: DeliveryService;
  let routineGenerator: RoutineGeneratorService;

  // GHN fee is quoted over the network in prod; stub it so the flow is deterministic offline.
  const SHIPPING_FEE_VND = 30_000;
  const SHIPPING_ADDRESS = {
    recipientName: 'Nguyen Van A',
    recipientPhone: '0901234567',
    provinceId: 202,
    districtId: 1442,
    wardCode: '21012',
    streetAddress: '123 Le Loi, Ben Nghe',
  };

  jest.setTimeout(60_000);

  beforeAll(async () => {
    const redis = createInMemoryRedis();

    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        KeycloakAdminModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
        TypeOrmModule.forFeature([
          SurveyRecommendation,
          SurveyRecommendationItem,
          Customer,
          CustomerSurvey,
          CustomerAllergy,
          IngredientConflict,
          ProductProtocol,
          ProductVariant,
          StockBatch,
          CommerceSetting,
          Order,
          OrderItem,
          Product,
          Routine,
          RoutineStep,
          RoutineStepProtocol,
          RoutineStepDetails,
          Delivery,
          DeliveryProvider,
          DeliveryStatusEvent,
        ]),
        RuleEngineModule,
      ],
      providers: [
        RecommendationService,
        CartService,
        OrdersService,
        DeliveryService,
        GhnClient,
        RoutineGeneratorService,
        MockLlmRoutineProvider,
        { provide: LLM_ROUTINE_PROVIDER, useClass: MockLlmRoutineProvider },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    dataSource = moduleFixture.get(DataSource);
    recommendationService = moduleFixture.get(RecommendationService);
    cartService = moduleFixture.get(CartService);
    ordersService = moduleFixture.get(OrdersService);
    deliveryService = moduleFixture.get(DeliveryService);
    routineGenerator = moduleFixture.get(RoutineGeneratorService);

    // OrdersService.createFromCart requires an active GHN provider row and quotes a
    // live GHN fee. Seed the provider and stub the network quote so the flow is offline.
    const providerRepo = dataSource.getRepository(DeliveryProvider);
    if (!(await providerRepo.findOneBy({ code: 'GHN' }))) {
      await providerRepo.save(
        providerRepo.create({
          code: 'GHN',
          name: 'Giao Hàng Nhanh',
          isActive: true,
        }),
      );
    }
    jest.spyOn(deliveryService, 'quoteFee').mockResolvedValue(SHIPPING_FEE_VND);
  });

  afterAll(async () => {
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  async function seedScenario() {
    const suffix = Math.random().toString(36).slice(2, 8);
    const userRepo = dataSource.getRepository(User);
    const customerRepo = dataSource.getRepository(Customer);
    const categoryRepo = dataSource.getRepository(LabelCategory);
    const labelRepo = dataSource.getRepository(Label);
    const questionRepo = dataSource.getRepository(Question);
    const surveyRepo = dataSource.getRepository(CustomerSurvey);
    const answerRepo = dataSource.getRepository(Answer);
    const answerLabelRepo = dataSource.getRepository(AnswerLabel);
    const ingredientRepo = dataSource.getRepository(Ingredient);
    const protocolRepo = dataSource.getRepository(IngredientProtocol);
    const protocolLabelRepo = dataSource.getRepository(ProtocolLabel);
    const brandRepo = dataSource.getRepository(ProductBrand);
    const productCategoryRepo = dataSource.getRepository(ProductCategory);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);
    const productProtocolRepo = dataSource.getRepository(ProductProtocol);
    const settingRepo = dataSource.getRepository(CommerceSetting);

    const existingSetting = await settingRepo.findOneBy({
      key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
    });
    if (!existingSetting) {
      await settingRepo.save(
        settingRepo.create({
          key: CommerceSettingKey.SURVEY_COMBO_DISCOUNT_PCT,
          value: '10',
          updatedByUserId: null,
        }),
      );
    }

    const existingMinSubtotal = await settingRepo.findOneBy({
      key: CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
    });
    if (!existingMinSubtotal) {
      await settingRepo.save(
        settingRepo.create({
          key: CommerceSettingKey.SURVEY_COMBO_MIN_SUBTOTAL_VND,
          value: '300000',
          updatedByUserId: null,
        }),
      );
    }

    const user = await userRepo.save(
      userRepo.create({
        keycloakSub: `sub-${suffix}`,
        email: `cust-${suffix}@example.com`,
        name: 'Survey Customer',
        provider: 'keycloak',
        roles: [Role.Customer],
        isActive: true,
      }),
    );
    const customer = await customerRepo.save(
      customerRepo.create({
        userId: user.id,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('1995-01-01'),
      }),
    );

    const labelCategory = await categoryRepo.save(
      categoryRepo.create({
        code: `GOAL_${suffix}`,
        name: 'Goals',
      }),
    );
    const acneLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: labelCategory.id,
        code: `ACNE_${suffix}`,
        name: 'Acne',
        vietnameseNormalized: 'Mụn sưng, mụn viêm hoặc mụn trứng cá',
        isActive: true,
      }),
    );

    const question = await questionRepo.save(
      questionRepo.create({
        code: `Q_${suffix}`,
        text: 'Concern?',
        questionType: 'MULTI_SELECT',
        displayOrder: 1,
        isActive: true,
      }),
    );

    const survey = await surveyRepo.save(
      surveyRepo.create({
        customerId: customer.id,
        isCompleted: true,
        completedAt: new Date(),
      }),
    );
    const answer = await answerRepo.save(
      answerRepo.create({
        surveyId: survey.id,
        questionId: question.id,
        value: 'acne',
      }),
    );
    await answerLabelRepo.save(
      answerLabelRepo.create({
        answerId: answer.id,
        labelId: acneLabel.id,
      }),
    );

    const ingredient = await ingredientRepo.save(
      ingredientRepo.create({
        name: `Salicylic ${suffix}`,
        ingredientType: 'bha',
        isActiveIngredient: true,
      }),
    );
    const protocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: ingredient.id,
        code: `salicylic_${suffix}`,
        name: 'Salicylic protocol',
        timeOfUse: TimeOfUse.PM,
        isActive: true,
      }),
    );
    await protocolLabelRepo.save(
      protocolLabelRepo.create({
        protocolId: protocol.id,
        labelId: acneLabel.id,
        matchType: LabelMatchType.OPTIONAL,
      }),
    );

    const brand = await brandRepo.save(
      brandRepo.create({ name: `Brand ${suffix}`, isActive: true }),
    );
    const productCategory = await productCategoryRepo.save(
      productCategoryRepo.create({
        code: `CAT_${suffix}`,
        name: 'Treatment',
        isActive: true,
      }),
    );
    const product = await productRepo.save(
      productRepo.create({
        name: `Acne Serum ${suffix}`,
        brandId: brand.id,
        categoryId: productCategory.id,
        isActive: true,
      }),
    );
    const variant = await variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: `SKU-${suffix}`,
        priceVnd: 200000,
        isActive: true,
      }),
    );
    const alternateVariant = await variantRepo.save(
      variantRepo.create({
        productId: product.id,
        sku: `SKU-ALT-${suffix}`,
        priceVnd: 250000,
        isActive: true,
      }),
    );
    await productProtocolRepo.save(
      productProtocolRepo.create({
        productId: product.id,
        protocolId: protocol.id,
      }),
    );

    const product2 = await productRepo.save(
      productRepo.create({
        name: `Acne Gel ${suffix}`,
        brandId: brand.id,
        categoryId: productCategory.id,
        isActive: true,
      }),
    );
    const variant2 = await variantRepo.save(
      variantRepo.create({
        productId: product2.id,
        sku: `SKU2-${suffix}`,
        priceVnd: 100000,
        isActive: true,
      }),
    );

    const batchRepo = dataSource.getRepository(StockBatch);
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    for (const productVariantId of [
      variant.id,
      alternateVariant.id,
      variant2.id,
    ]) {
      await batchRepo.save(
        batchRepo.create({
          productVariantId,
          batchCode: `BATCH-${productVariantId.slice(0, 8)}`,
          initialQuantity: 50,
          remainingQuantity: 50,
          manufacturingDate: today,
          expirationDate: nextYear,
        }),
      );
    }

    const protocol2 = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: ingredient.id,
        code: `benzoyl_${suffix}`,
        name: 'Benzoyl protocol',
        timeOfUse: TimeOfUse.AM,
        isActive: true,
      }),
    );
    await protocolLabelRepo.save(
      protocolLabelRepo.create({
        protocolId: protocol2.id,
        labelId: acneLabel.id,
        matchType: LabelMatchType.OPTIONAL,
      }),
    );
    await productProtocolRepo.save(
      productProtocolRepo.create({
        productId: product2.id,
        protocolId: protocol2.id,
      }),
    );

    const conflictRepo = dataSource.getRepository(IngredientConflict);
    await conflictRepo.save(
      conflictRepo.create({
        protocolId: protocol.id,
        conflictingProtocolId: protocol2.id,
        severity: ConflictSeverity.HIGH,
        reason: 'Salicylic acid + benzoyl peroxide may increase irritation',
        description:
          'Salicylic acid kết hợp benzoyl peroxide có thể gây kích ứng mạnh',
      }),
    );

    return {
      user,
      customer,
      survey,
      variant,
      alternateVariant,
      variant2,
      acneLabel,
    };
  }

  it('recommends products, applies combo discount, and generates a routine after payment', async () => {
    const { user, variant, alternateVariant, variant2, acneLabel } =
      await seedScenario();

    const recommendation = await recommendationService.getLatestForUser(
      user.id,
    );
    expect(recommendation.products.length).toBeGreaterThanOrEqual(2);
    expect(recommendation.customerSurveyId).toBeTruthy();
    expect(Array.isArray(recommendation.conflicts ?? [])).toBe(true);
    expect(acneLabel.name).toBe('Acne');
    expect(acneLabel.vietnameseNormalized).toContain('Mụn');

    const recommendedVariantIds = recommendation.products.map(
      (p) => p.productVariantId,
    );
    expect(recommendedVariantIds).toEqual(
      expect.arrayContaining([variant.id, variant2.id]),
    );
    const rankedProduct = recommendation.products.find(
      (product) => product.productVariantId === variant.id,
    )!;
    expect(
      rankedProduct.variants.map((candidate) => candidate.productVariantId),
    ).toEqual(expect.arrayContaining([variant.id, alternateVariant.id]));

    // Cover every protocol; include both ranked variants for the first protocol.
    let cart = await cartService.getCart(user.id);
    expect(cart.conflicts).toEqual([]);

    for (const productVariantId of [
      variant.id,
      alternateVariant.id,
      variant2.id,
    ]) {
      cart = await cartService.addItem(user.id, {
        productVariantId,
        quantity: productVariantId === variant.id ? 2 : 1,
        source: OrderSource.SURVEY,
        surveyRecommendationId: recommendation.id,
      });
    }

    expect(Array.isArray(cart.conflicts)).toBe(true);
    expect(cart.conflicts.length).toBeGreaterThanOrEqual(1);
    const cartConflict = cart.conflicts[0];
    expect(cartConflict.description).toMatch(/[\u00C0-\u1EF9]/);
    expect(cartConflict.description.length).toBeGreaterThan(0);
    expect(cartConflict.productVariantIds).toEqual(
      expect.arrayContaining([variant.id, alternateVariant.id]),
    );
    expect(cartConflict.conflictingProductVariantIds).toEqual([variant2.id]);

    const order = await ordersService.createFromCart(user.id, {
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(order.source).toBe(OrderSource.SURVEY);
    expect(order.discountType).toBe(OrderDiscountType.COMBO);
    expect(order.discountVnd).toBe(Math.floor((order.subtotalVnd * 10) / 100));
    expect(order.totalVnd).toBe(
      order.subtotalVnd - order.discountVnd + SHIPPING_FEE_VND,
    );
    expect(order.shippingFeeVnd).toBe(SHIPPING_FEE_VND);
    expect(order.items).toHaveLength(3);

    await dataSource
      .getRepository(Order)
      .update({ id: order.id }, { status: OrderStatus.PAID });

    const routine = await routineGenerator.generateForUser(user.id, {
      orderId: order.id,
    });
    expect(routine.sourceOrderId).toBe(order.id);
    expect(routine.steps.length).toBeGreaterThan(0);
    expect(routine.customerSurveyId).toBe(recommendation.customerSurveyId);
    const step = routine.steps[0];
    expect(step).toEqual(
      expect.objectContaining({
        period: expect.any(String),
        stepOrder: expect.any(Number),
        instructions: expect.any(String),
      }),
    );
    expect(step.productVariant).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
      }),
    );
    expect(step.productVariant).toHaveProperty('imageUrl');
    expect(step).toHaveProperty('waitMinutes');
    expect(step).toHaveProperty('dosageText');
    expect(step).toHaveProperty('amountMl');
  });

  it('applies combo when subtotal exceeds the minimum threshold', async () => {
    const { user, alternateVariant, variant2 } = await seedScenario();
    const recommendation = await recommendationService.getLatestForUser(
      user.id,
    );

    // 250000 + 100000 = 350000 > 300000
    await cartService.addItem(user.id, {
      productVariantId: alternateVariant.id,
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: recommendation.id,
    });
    await cartService.addItem(user.id, {
      productVariantId: variant2.id,
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: recommendation.id,
    });

    const order = await ordersService.createFromCart(user.id, {
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(order.discountType).toBe(OrderDiscountType.COMBO);
    expect(order.discountVnd).toBeGreaterThan(0);
  });

  it('does not apply combo discount when subtotal is at or below the threshold', async () => {
    const { user } = await seedScenario();
    const recommendation = await recommendationService.getLatestForUser(
      user.id,
    );
    expect(recommendation.products.length).toBeGreaterThanOrEqual(2);

    await cartService.addItem(user.id, {
      productVariantId: recommendation.products[0].productVariantId,
      quantity: 1,
      source: OrderSource.SURVEY,
      surveyRecommendationId: recommendation.id,
    });

    const order = await ordersService.createFromCart(user.id, {
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(order.subtotalVnd).toBeLessThanOrEqual(300000);
    expect(order.discountVnd).toBe(0);
    expect(order.discountType).toBeNull();
  });

  it('allows non-recommended catalog products in a SURVEY cart and routine', async () => {
    const { user, variant, variant2 } = await seedScenario();
    const recommendation = await recommendationService.getLatestForUser(
      user.id,
    );

    const suffix = Date.now().toString(36);
    const brandRepo = dataSource.getRepository(ProductBrand);
    const categoryRepo = dataSource.getRepository(ProductCategory);
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(ProductVariant);
    const batchRepo = dataSource.getRepository(StockBatch);

    const brand = await brandRepo.find({ take: 1 });
    const category = await categoryRepo.find({ take: 1 });
    const extraProduct = await productRepo.save(
      productRepo.create({
        name: `Extra Moisturizer ${suffix}`,
        brandId: brand[0].id,
        categoryId: category[0].id,
        isActive: true,
      }),
    );
    const extraVariant = await variantRepo.save(
      variantRepo.create({
        productId: extraProduct.id,
        sku: `EXTRA-${suffix}`,
        priceVnd: 50000,
        isActive: true,
      }),
    );
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    await batchRepo.save(
      batchRepo.create({
        productVariantId: extraVariant.id,
        batchCode: `SEED-EXTRA-${suffix}`,
        initialQuantity: 20,
        remainingQuantity: 20,
        manufacturingDate: today,
        expirationDate: nextYear,
      }),
    );

    // Recommended + non-recommended extras; subtotal 200k+100k+50k = 350k > 300k
    for (const productVariantId of [variant.id, variant2.id, extraVariant.id]) {
      await cartService.addItem(user.id, {
        productVariantId,
        quantity: 1,
        source: OrderSource.SURVEY,
        surveyRecommendationId: recommendation.id,
      });
    }

    const order = await ordersService.createFromCart(user.id, {
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(order.source).toBe(OrderSource.SURVEY);
    expect(order.items).toHaveLength(3);
    expect(order.discountType).toBe(OrderDiscountType.COMBO);
    const extraItem = order.items.find(
      (item) => item.productVariantId === extraVariant.id,
    );
    expect(extraItem).toBeDefined();
    expect(extraItem!.surveyRecommendationItemId).toBeNull();

    await dataSource
      .getRepository(Order)
      .update({ id: order.id }, { status: OrderStatus.PAID });

    const routine = await routineGenerator.generateForUser(user.id, {
      orderId: order.id,
    });
    const stepVariantIds = routine.steps.map((s) => s.productVariant.id);
    expect(stepVariantIds).toEqual(
      expect.arrayContaining([variant.id, variant2.id, extraVariant.id]),
    );
  });

  it('blocks routine generation for catalog orders', async () => {
    const { user, variant } = await seedScenario();

    await cartService.addItem(user.id, {
      productVariantId: variant.id,
      quantity: 1,
      source: OrderSource.CATALOG,
    });
    const order = await ordersService.createFromCart(user.id, {
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(order.source).toBe(OrderSource.CATALOG);

    await dataSource
      .getRepository(Order)
      .update({ id: order.id }, { status: OrderStatus.PAID });

    await expect(
      routineGenerator.generateForUser(user.id, { orderId: order.id }),
    ).rejects.toThrow(/skincare survey recommendation/i);
  });
});
