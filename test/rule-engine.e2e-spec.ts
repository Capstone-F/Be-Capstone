import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { LabelMatchType, TimeOfUse } from '../src/ingredients/enums';
import { Ingredient } from '../src/ingredients/ingredient.entity';
import { IngredientProtocol } from '../src/ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../src/ingredients/protocol-label.entity';
import { RuleEngineModule } from '../src/rule-engine/rule-engine.module';
import { RuleEngineService } from '../src/rule-engine/rule-engine.service';
import { Label } from '../src/survey/label.entity';
import { LabelCategory } from '../src/survey/label-category.entity';

describe('RuleEngineService (e2e)', () => {
  let moduleFixture: TestingModule;
  let ruleEngineService: RuleEngineService;
  let dataSource: DataSource;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [join(__dirname, '../src/**/*.entity.ts')],
          synchronize: true,
        }),
        RuleEngineModule,
      ],
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

    expect(result).toEqual({ labels: [], protocols: [] });
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
});
