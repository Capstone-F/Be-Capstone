import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';
import { DataSource, In } from 'typeorm';
import { LabelMatchType, TimeOfUse } from '../src/ingredients/enums';
import { Ingredient } from '../src/ingredients/ingredient.entity';
import { IngredientProtocol } from '../src/ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../src/ingredients/protocol-label.entity';
import { RuleEngineModule } from '../src/rule-engine/rule-engine.module';
import { RuleEngineService } from '../src/rule-engine/rule-engine.service';
import { Label } from '../src/survey/label.entity';
import { LabelCategory } from '../src/survey/label-category.entity';
import { Answer } from '../src/survey/answer.entity';
import { AnswerLabel } from '../src/survey/answer-label.entity';
import { CustomerSurvey } from '../src/survey/customer-survey.entity';
import { Question } from '../src/survey/question.entity';
import { Customer } from '../src/users/customer.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { SURVEY_DEMO_CASES } from '../src/database/seeds/survey-demo-cases';

describe('RuleEngineService (e2e)', () => {
  let moduleFixture: TestingModule;
  let ruleEngineService: RuleEngineService;
  let dataSource: DataSource;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(e2eTypeOrmConfig), RuleEngineModule],
    }).compile();

    ruleEngineService = moduleFixture.get(RuleEngineService);
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  async function seedRuleEngineScenario(): Promise<{
    oilyLabel: Label;
    acneLabel: Label;
    pregnancyLabel: Label;
    antiAgingLabel: Label;
    bhaProtocol: IngredientProtocol;
    retinolProtocol: IngredientProtocol;
    optionalOnlyProtocol: IngredientProtocol;
    inactiveProtocol: IngredientProtocol;
  }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const ingredientRepo = dataSource.getRepository(Ingredient);
    const categoryRepo = dataSource.getRepository(LabelCategory);
    const labelRepo = dataSource.getRepository(Label);
    const protocolRepo = dataSource.getRepository(IngredientProtocol);
    const protocolLabelRepo = dataSource.getRepository(ProtocolLabel);

    const bhaIngredient = await ingredientRepo.save(
      ingredientRepo.create({
        name: `Salicylic Acid E2E ${suffix}`,
        ingredientType: 'bha',
        isActiveIngredient: true,
      }),
    );
    const retinolIngredient = await ingredientRepo.save(
      ingredientRepo.create({
        name: `Retinol E2E ${suffix}`,
        ingredientType: 'retinoid',
        isActiveIngredient: true,
      }),
    );
    const niacinamideIngredient = await ingredientRepo.save(
      ingredientRepo.create({
        name: `Niacinamide E2E ${suffix}`,
        ingredientType: 'vitamin',
        isActiveIngredient: true,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: `SKIN_PROFILE_E2E_${suffix}`,
        name: 'Skin Profile',
      }),
    );

    const oilyLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: category.id,
        code: `OILY_SKIN_E2E_${suffix}`,
        name: 'Oily Skin',
        isActive: true,
      }),
    );
    const acneLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: category.id,
        code: `ACNE_PRONE_E2E_${suffix}`,
        name: 'Acne Prone',
        isActive: true,
      }),
    );
    const pregnancyLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: category.id,
        code: `PREGNANCY_E2E_${suffix}`,
        name: 'Pregnancy',
        isActive: true,
      }),
    );
    const antiAgingLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: category.id,
        code: `ANTI_AGING_E2E_${suffix}`,
        name: 'Anti-aging',
        isActive: true,
      }),
    );

    const bhaProtocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: bhaIngredient.id,
        code: `BHA_2PCT_PM_E2E_${suffix}`,
        name: 'BHA 2% Evening',
        concentrationPct: 2,
        timePerWeek: 3,
        timeOfUse: TimeOfUse.PM,
        durationWeeks: 8,
        instructions: 'Apply at night',
        isActive: true,
      }),
    );
    const retinolProtocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: retinolIngredient.id,
        code: `RETINOL_0.3_PM_E2E_${suffix}`,
        name: 'Retinol 0.3% Evening',
        concentrationPct: 0.3,
        timePerWeek: 2,
        timeOfUse: TimeOfUse.PM,
        durationWeeks: 12,
        isActive: true,
      }),
    );
    const optionalOnlyProtocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: niacinamideIngredient.id,
        code: `NIACINAMIDE_AM_E2E_${suffix}`,
        name: 'Niacinamide Morning',
        concentrationPct: 5,
        timeOfUse: TimeOfUse.AM,
        isActive: true,
      }),
    );
    const inactiveProtocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: bhaIngredient.id,
        code: `INACTIVE_PROTOCOL_E2E_${suffix}`,
        name: 'Inactive Protocol',
        isActive: false,
      }),
    );

    await protocolLabelRepo.save([
      protocolLabelRepo.create({
        protocolId: bhaProtocol.id,
        labelId: oilyLabel.id,
        matchType: LabelMatchType.REQUIRED,
      }),
      protocolLabelRepo.create({
        protocolId: bhaProtocol.id,
        labelId: acneLabel.id,
        matchType: LabelMatchType.OPTIONAL,
      }),
      protocolLabelRepo.create({
        protocolId: retinolProtocol.id,
        labelId: oilyLabel.id,
        matchType: LabelMatchType.REQUIRED,
      }),
      protocolLabelRepo.create({
        protocolId: retinolProtocol.id,
        labelId: pregnancyLabel.id,
        matchType: LabelMatchType.EXCLUDED,
      }),
      protocolLabelRepo.create({
        protocolId: retinolProtocol.id,
        labelId: antiAgingLabel.id,
        matchType: LabelMatchType.OPTIONAL,
      }),
      protocolLabelRepo.create({
        protocolId: optionalOnlyProtocol.id,
        labelId: antiAgingLabel.id,
        matchType: LabelMatchType.OPTIONAL,
      }),
      protocolLabelRepo.create({
        protocolId: inactiveProtocol.id,
        labelId: oilyLabel.id,
        matchType: LabelMatchType.REQUIRED,
      }),
    ]);

    return {
      oilyLabel,
      acneLabel,
      pregnancyLabel,
      antiAgingLabel,
      bhaProtocol,
      retinolProtocol,
      optionalOnlyProtocol,
      inactiveProtocol,
    };
  }

  it('should return empty context when no label ids are provided', async () => {
    const result = await ruleEngineService.buildRoutineContext([]);

    expect(result).toEqual({
      customerProfile: null,
      labels: [],
      protocols: [],
    });
  });

  it('should filter and rank protocols from persisted survey labels', async () => {
    const {
      oilyLabel,
      acneLabel,
      antiAgingLabel,
      bhaProtocol,
      retinolProtocol,
      optionalOnlyProtocol,
      inactiveProtocol,
    } = await seedRuleEngineScenario();

    const result = await ruleEngineService.buildRoutineContext([
      oilyLabel.id,
      acneLabel.id,
      antiAgingLabel.id,
    ]);

    expect(result.labels).toHaveLength(3);
    expect(result.labels.map((label) => label.id).sort()).toEqual(
      [oilyLabel.id, acneLabel.id, antiAgingLabel.id].sort(),
    );

    expect(result.protocols.map((protocol) => protocol.id)).toEqual([
      bhaProtocol.id,
      retinolProtocol.id,
      optionalOnlyProtocol.id,
    ]);
    expect(result.protocols[0]).toMatchObject({
      id: bhaProtocol.id,
      code: bhaProtocol.code,
      matchScore: 2,
      matchedLabelCodes: expect.arrayContaining([
        oilyLabel.code,
        acneLabel.code,
      ]),
    });
    expect(result.protocols[1]).toMatchObject({
      id: retinolProtocol.id,
      code: retinolProtocol.code,
      matchScore: 2,
      matchedLabelCodes: expect.arrayContaining([
        oilyLabel.code,
        antiAgingLabel.code,
      ]),
    });
    expect(result.protocols[2]).toMatchObject({
      id: optionalOnlyProtocol.id,
      code: optionalOnlyProtocol.code,
      matchScore: 1,
      matchedLabelCodes: [antiAgingLabel.code],
    });

    const returnedIds = result.protocols.map((protocol) => protocol.id);
    expect(returnedIds).not.toContain(inactiveProtocol.id);
  });

  it('should exclude protocols when an EXCLUDED label is present', async () => {
    const { oilyLabel, pregnancyLabel, retinolProtocol } =
      await seedRuleEngineScenario();

    const result = await ruleEngineService.buildRoutineContext([
      oilyLabel.id,
      pregnancyLabel.id,
    ]);

    expect(result.protocols.map((protocol) => protocol.id)).not.toContain(
      retinolProtocol.id,
    );
  });

  it('should exclude protocols when REQUIRED labels are missing', async () => {
    const { acneLabel, bhaProtocol } = await seedRuleEngineScenario();

    const result = await ruleEngineService.buildRoutineContext([acneLabel.id]);

    expect(result.protocols.map((protocol) => protocol.id)).not.toContain(
      bhaProtocol.id,
    );
  });

  it('should ignore inactive labels passed as input', async () => {
    const categoryRepo = dataSource.getRepository(LabelCategory);
    const labelRepo = dataSource.getRepository(Label);

    const suffix = Math.random().toString(36).slice(2, 8);
    const category = await categoryRepo.save(
      categoryRepo.create({
        code: `INACTIVE_LABEL_CAT_E2E_${suffix}`,
        name: 'Inactive Label Category',
      }),
    );
    const inactiveLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: category.id,
        code: `INACTIVE_LABEL_E2E_${suffix}`,
        name: 'Inactive Label',
        isActive: false,
      }),
    );

    const result = await ruleEngineService.buildRoutineContext([
      inactiveLabel.id,
    ]);

    expect(result.labels).toHaveLength(0);
    expect(result.protocols).toHaveLength(0);
  });

  it('should resolve gender enum from customer profile in buildContextForCustomer', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const userRepo = dataSource.getRepository(User);
    const customerRepo = dataSource.getRepository(Customer);
    const categoryRepo = dataSource.getRepository(LabelCategory);
    const labelRepo = dataSource.getRepository(Label);
    const questionRepo = dataSource.getRepository(Question);
    const surveyRepo = dataSource.getRepository(CustomerSurvey);
    const answerRepo = dataSource.getRepository(Answer);
    const answerLabelRepo = dataSource.getRepository(AnswerLabel);
    const protocolRepo = dataSource.getRepository(IngredientProtocol);
    const protocolLabelRepo = dataSource.getRepository(ProtocolLabel);
    const ingredientRepo = dataSource.getRepository(Ingredient);

    const user = await userRepo.save(
      userRepo.create({
        keycloakSub: `kc-rule-engine-gender-${suffix}`,
        email: `gender-e2e-${suffix}@example.com`,
        name: 'Gender E2E User',
      }),
    );
    const customer = await customerRepo.save(
      customerRepo.create({
        userId: user.id,
        dateOfBirth: new Date('1998-03-10'),
        gender: Gender.FEMALE,
      }),
    );

    const genderCategory = await categoryRepo.save(
      categoryRepo.create({
        code: `GENDER_E2E_${suffix}`,
        name: 'Gender',
      }),
    );
    const ageCategory = await categoryRepo.save(
      categoryRepo.create({
        code: `AGE_GROUP_E2E_${suffix}`,
        name: 'Age Group',
      }),
    );
    const concernCategory = await categoryRepo.save(
      categoryRepo.create({
        code: `SKIN_CONCERN_E2E_${suffix}`,
        name: 'Skin Concern',
      }),
    );

    await labelRepo.save(
      labelRepo.create({
        categoryId: genderCategory.id,
        code: 'FEMALE',
        name: 'Female',
        isActive: true,
      }),
    );
    await labelRepo.save(
      labelRepo.create({
        categoryId: ageCategory.id,
        code: 'AGE_26_35',
        name: '26–35',
        isActive: true,
      }),
    );
    const acneLabel = await labelRepo.save(
      labelRepo.create({
        categoryId: concernCategory.id,
        code: `ACNE_E2E_${suffix}`,
        name: 'Acne',
        isActive: true,
      }),
    );

    const question = await questionRepo.save(
      questionRepo.create({
        code: `ACNE_QUESTION_E2E_${suffix}`,
        text: 'Do you have acne?',
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
        value: 'yes',
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
        name: `Gender Test Ingredient ${suffix}`,
        ingredientType: 'bha',
        isActiveIngredient: true,
      }),
    );
    const protocol = await protocolRepo.save(
      protocolRepo.create({
        ingredientId: ingredient.id,
        code: `GENDER_TEST_PROTOCOL_E2E_${suffix}`,
        name: 'Gender Test Protocol',
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

    const result = await ruleEngineService.buildContextForCustomer(customer.id);

    expect(result.customerProfile).toMatchObject({
      gender: Gender.FEMALE,
      age: expect.any(Number),
    });
    expect(result.labels.map((label) => label.code)).toEqual(
      expect.arrayContaining(['FEMALE', 'AGE_26_35', acneLabel.code]),
    );
    expect(result.protocols).toHaveLength(1);
    expect(result.protocols[0].id).toBe(protocol.id);
  });

  describe('seeded survey demo cases (docs §10.5)', () => {
    async function seedDemoCatalog(suffix: string): Promise<void> {
      const ingredientRepo = dataSource.getRepository(Ingredient);
      const categoryRepo = dataSource.getRepository(LabelCategory);
      const labelRepo = dataSource.getRepository(Label);
      const protocolRepo = dataSource.getRepository(IngredientProtocol);
      const protocolLabelRepo = dataSource.getRepository(ProtocolLabel);

      const ingredient = await ingredientRepo.save(
        ingredientRepo.create({
          name: `Demo Catalog Ingredient ${suffix}`,
          ingredientType: 'vitamin',
          isActiveIngredient: true,
        }),
      );

      const category = await categoryRepo.save(
        categoryRepo.create({
          code: `DEMO_CAT_${suffix}`,
          name: 'Demo Catalog',
        }),
      );

      const allLabelCodes = [
        ...new Set(SURVEY_DEMO_CASES.flatMap((c) => c.labels)),
        'PREGNANCY',
      ];
      const labelsByCode = new Map<string, Label>();
      for (const code of allLabelCodes) {
        let label = await labelRepo.findOneBy({ code });
        if (!label) {
          label = await labelRepo.save(
            labelRepo.create({
              categoryId: category.id,
              code,
              name: code,
              isActive: true,
            }),
          );
        }
        labelsByCode.set(code, label);
      }

      const protocolDefs: Array<{
        code: string;
        labelCodes: Array<{ code: string; matchType: LabelMatchType }>;
      }> = [
        {
          code: 'retinol_0.3_anti_aging',
          labelCodes: [
            { code: 'ANTI_AGING', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_WRINKLES', matchType: LabelMatchType.OPTIONAL },
            { code: 'PREGNANCY', matchType: LabelMatchType.EXCLUDED },
          ],
        },
        {
          code: 'salicylic_acne',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'benzoyl_acne',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'treatment_acne_spot',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'azelaic_pigmentation',
          labelCodes: [
            { code: 'REDUCE_PIGMENTATION', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDNESS', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_REDNESS', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'ceramide_barrier',
          labelCodes: [
            { code: 'BARRIER_REPAIR', matchType: LabelMatchType.OPTIONAL },
            { code: 'BARRIER_DAMAGE', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_REDNESS', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'ha_hydration',
          labelCodes: [
            { code: 'HYDRATION', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'niacinamide_general',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
            { code: 'ANTI_AGING', matchType: LabelMatchType.OPTIONAL },
            { code: 'EVEN_SKIN_TONE', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'cleanser_gentle_foam',
          labelCodes: [
            { code: 'BARRIER_REPAIR', matchType: LabelMatchType.OPTIONAL },
            { code: 'OIL_CONTROL', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_REDNESS', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'toner_exfoliating',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'serum_niacinamide',
          labelCodes: [
            { code: 'ACNE_TREATMENT', matchType: LabelMatchType.OPTIONAL },
            { code: 'EVEN_SKIN_TONE', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'moisturizer_barrier',
          labelCodes: [
            { code: 'BARRIER_REPAIR', matchType: LabelMatchType.OPTIONAL },
            { code: 'HYDRATION', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_REDNESS', matchType: LabelMatchType.OPTIONAL },
          ],
        },
        {
          code: 'sunscreen_daily_spf',
          labelCodes: [
            { code: 'HIGH_SUN_EXPOSURE', matchType: LabelMatchType.OPTIONAL },
            { code: 'HYDRATION', matchType: LabelMatchType.OPTIONAL },
            { code: 'REDUCE_PIGMENTATION', matchType: LabelMatchType.OPTIONAL },
          ],
        },
      ];

      for (const def of protocolDefs) {
        const protocol = await protocolRepo.save(
          protocolRepo.create({
            ingredientId: ingredient.id,
            code: `${def.code}_${suffix}`,
            name: def.code,
            isActive: true,
          }),
        );
        for (const pl of def.labelCodes) {
          const label = labelsByCode.get(pl.code);
          if (!label) continue;
          await protocolLabelRepo.save(
            protocolLabelRepo.create({
              protocolId: protocol.id,
              labelId: label.id,
              matchType: pl.matchType,
            }),
          );
        }
      }
    }

    it('matches expected protocol themes for every demo persona', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      await seedDemoCatalog(suffix);

      const labelRepo = dataSource.getRepository(Label);

      for (const demoCase of SURVEY_DEMO_CASES) {
        const labels = await labelRepo.find({
          where: { code: In(demoCase.labels), isActive: true },
        });
        expect(labels.length).toBe(demoCase.labels.length);

        const result = await ruleEngineService.buildRoutineContext(
          labels.map((label) => label.id),
        );
        const matchedBaseCodes = result.protocols.map((p) =>
          p.code.replace(`_${suffix}`, ''),
        );

        for (const code of demoCase.expectedProtocolCodes) {
          expect(matchedBaseCodes).toContain(code);
        }
      }
    });

    it('excludes retinol when PREGNANCY is present on anti-aging persona', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      await seedDemoCatalog(suffix);

      const antiAging = SURVEY_DEMO_CASES.find((c) => c.name === 'Anti-aging')!;
      const labelRepo = dataSource.getRepository(Label);
      const labels = await labelRepo.find({
        where: {
          code: In([...antiAging.labels, 'PREGNANCY']),
          isActive: true,
        },
      });

      const result = await ruleEngineService.buildRoutineContext(
        labels.map((label) => label.id),
      );
      const matchedBaseCodes = result.protocols.map((p) =>
        p.code.replace(`_${suffix}`, ''),
      );

      expect(matchedBaseCodes).not.toContain('retinol_0.3_anti_aging');
      expect(matchedBaseCodes).toContain('niacinamide_general');
    });
  });
});
