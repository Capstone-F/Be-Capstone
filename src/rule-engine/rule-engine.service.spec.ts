import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  LabelMatchType,
  SkinTypeRecommendation,
  TimeOfUse,
} from '../ingredients/enums';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { ProtocolSkinType } from '../ingredients/protocol-skin-type.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Answer } from '../survey/answer.entity';
import { AnswerLabel } from '../survey/answer-label.entity';
import { Label } from '../survey/label.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { Gender } from '../users/gender.enum';
import { SkinType } from '../users/skin-type.entity';
import { SURVEY_DEMO_CASES } from '../database/seeds/survey-demo-cases';
import { RuleEngineService } from './rule-engine.service';

/** Seed-equivalent protocol↔label wiring used by demo persona tests. */
const SEED_PROTOCOL_LABELS: Array<{
  protocolCode: string;
  labelCode: string;
  matchType: LabelMatchType;
}> = [
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'ANTI_AGING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'REDUCE_WRINKLES',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'retinol_0.3_anti_aging',
    labelCode: 'PREGNANCY',
    matchType: LabelMatchType.EXCLUDED,
  },
  {
    protocolCode: 'salicylic_acne',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDUCE_PIGMENTATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'azelaic_pigmentation',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'BARRIER_DAMAGE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ceramide_barrier',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'ha_hydration',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'ANTI_AGING',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'niacinamide_general',
    labelCode: 'EVEN_SKIN_TONE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'benzoyl_acne',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'OIL_CONTROL',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'cleanser_gentle_foam',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'toner_exfoliating',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'serum_niacinamide',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'serum_niacinamide',
    labelCode: 'EVEN_SKIN_TONE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'BARRIER_REPAIR',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'moisturizer_barrier',
    labelCode: 'REDUCE_REDNESS',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'HIGH_SUN_EXPOSURE',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'HYDRATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'sunscreen_daily_spf',
    labelCode: 'REDUCE_PIGMENTATION',
    matchType: LabelMatchType.OPTIONAL,
  },
  {
    protocolCode: 'treatment_acne_spot',
    labelCode: 'ACNE_TREATMENT',
    matchType: LabelMatchType.OPTIONAL,
  },
];

const makeLabel = (overrides: Partial<Label> = {}): Label => ({
  id: 'label-1',
  categoryId: 'cat-1',
  code: 'OILY_SKIN',
  name: 'Oily Skin',
  description: null,
  isActive: true,
  answerLabels: [],
  protocolLabels: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeProtocolLabel = (
  overrides: Partial<ProtocolLabel> = {},
): ProtocolLabel => ({
  id: 'pl-1',
  protocolId: 'protocol-1',
  labelId: 'label-1',
  matchType: LabelMatchType.REQUIRED,
  protocol: {} as IngredientProtocol,
  label: {} as Label,
  ...overrides,
});

const makeProtocolSkinType = (
  overrides: Partial<ProtocolSkinType> = {},
): ProtocolSkinType => ({
  id: 'pst-1',
  protocolId: 'protocol-1',
  skinTypeId: 'skin-type-1',
  recommendation: SkinTypeRecommendation.RECOMMENDED,
  protocol: {} as IngredientProtocol,
  skinType: {
    id: 'skin-type-1',
    code: 'OSPW',
    name: 'Oily Sensitive Pigmented Wrinkled',
  } as SkinType,
  ...overrides,
});

const makeProtocol = (
  overrides: Partial<IngredientProtocol> = {},
): IngredientProtocol => ({
  id: 'protocol-1',
  ingredientId: 'ing-1',
  code: 'BHA_2PCT_PM',
  name: 'BHA 2% Evening Protocol',
  concentrationPct: 2,
  timePerWeek: 3,
  timeOfUse: TimeOfUse.PM,
  durationWeeks: 8,
  instructions: 'Apply at night',
  isActive: true,
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
  protocolLabels: [],
  protocolSkinTypes: [],
  conflicts: [],
  routineStepProtocols: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'customer-1',
  userId: 'user-1',
  phone: null,
  avatarUrl: null,
  dateOfBirth: new Date('1995-06-15'),
  gender: Gender.FEMALE,
  skinTypeDetails: {
    id: 'std-1',
    customerId: 'customer-1',
    skinTypeId: 'skin-type-1',
    oilyDryScore: null,
    sensitiveResistantScore: null,
    pigmentedNonPigmentedScore: null,
    wrinkledTightScore: null,
    assessedAt: null,
    skinType: {
      id: 'skin-type-1',
      code: 'OSPW',
      name: 'Oily Sensitive Pigmented Wrinkled',
      description: null,
      oilyDry: 'O',
      sensitiveResistant: 'S',
      pigmentedNonPigmented: 'P',
      wrinkledTight: 'W',
      protocolSkinTypes: [],
      customerDetails: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SkinType,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CustomerSkinTypeDetails,
  user: {} as Customer['user'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RuleEngineService', () => {
  let labelRepository: jest.Mocked<Pick<Repository<Label>, 'find' | 'findOne'>>;
  let protocolRepository: jest.Mocked<
    Pick<Repository<IngredientProtocol>, 'find'>
  >;
  let customerRepository: jest.Mocked<Pick<Repository<Customer>, 'findOne'>>;
  let customerSurveyRepository: jest.Mocked<
    Pick<Repository<CustomerSurvey>, 'findOne'>
  >;
  let customerAllergyRepository: jest.Mocked<
    Pick<Repository<CustomerAllergy>, 'find'>
  >;
  let service: RuleEngineService;

  const protocolRelations = {
    where: { isActive: true },
    relations: [
      'protocolLabels',
      'protocolSkinTypes',
      'protocolSkinTypes.skinType',
      'ingredient',
    ],
  };

  beforeEach(() => {
    labelRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    protocolRepository = {
      find: jest.fn(),
    };
    customerRepository = {
      findOne: jest.fn(),
    };
    customerSurveyRepository = {
      findOne: jest.fn(),
    };
    customerAllergyRepository = {
      find: jest.fn(),
    };
    service = new RuleEngineService(
      labelRepository as unknown as Repository<Label>,
      protocolRepository as unknown as Repository<IngredientProtocol>,
      customerRepository as unknown as Repository<Customer>,
      customerSurveyRepository as unknown as Repository<CustomerSurvey>,
      customerAllergyRepository as unknown as Repository<CustomerAllergy>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty context when labelIds is empty', async () => {
    protocolRepository.find.mockResolvedValue([]);

    const result = await service.buildRoutineContext([]);

    expect(result).toEqual({
      customerProfile: null,
      labels: [],
      protocols: [],
    });
    expect(labelRepository.find).not.toHaveBeenCalled();
    expect(protocolRepository.find).toHaveBeenCalledWith(protocolRelations);
  });

  it('should return matched labels and protocols that satisfy REQUIRED rules', async () => {
    const oilyLabel = makeLabel({
      id: 'label-oily',
      code: 'OILY_SKIN',
      name: 'Oily Skin',
    });
    const protocol = makeProtocol({
      id: 'protocol-bha',
      code: 'BHA_2PCT_PM',
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-oily',
          matchType: LabelMatchType.REQUIRED,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-oily']);

    expect(result.labels).toHaveLength(1);
    expect(result.labels[0]).toEqual({
      id: 'label-oily',
      code: 'OILY_SKIN',
      name: 'Oily Skin',
      description: null,
      categoryId: 'cat-1',
      source: 'PROFILE',
      weight: 1,
    });
    expect(result.protocols).toHaveLength(1);
    expect(result.protocols[0]).toMatchObject({
      id: 'protocol-bha',
      code: 'BHA_2PCT_PM',
      ingredientName: 'Salicylic Acid',
      concentrationPct: 2,
      timePerWeek: 3,
      timeOfUse: TimeOfUse.PM,
      durationWeeks: 8,
      instructions: 'Apply at night',
      matchScore: 1,
      matchedLabelCodes: ['OILY_SKIN'],
    });
  });

  it('should exclude protocols when an EXCLUDED label matches', async () => {
    const pregnancyLabel = makeLabel({
      id: 'label-pregnancy',
      code: 'PREGNANCY',
    });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-pregnancy',
          matchType: LabelMatchType.EXCLUDED,
        }),
        makeProtocolLabel({
          labelId: 'label-pregnancy',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([pregnancyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-pregnancy']);

    expect(result.labels).toHaveLength(1);
    expect(result.protocols).toHaveLength(0);
  });

  it('should exclude protocols when not all REQUIRED labels are present', async () => {
    const oilyLabel = makeLabel({ id: 'label-oily', code: 'OILY_SKIN' });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-oily',
          matchType: LabelMatchType.REQUIRED,
        }),
        makeProtocolLabel({
          id: 'pl-2',
          labelId: 'label-acne',
          matchType: LabelMatchType.REQUIRED,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-oily']);

    expect(result.protocols).toHaveLength(0);
  });

  it('should keep protocols matched only by OPTIONAL labels', async () => {
    const antiAgingLabel = makeLabel({
      id: 'label-anti-aging',
      code: 'ANTI_AGING',
    });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-anti-aging',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([antiAgingLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-anti-aging']);

    expect(result.protocols).toHaveLength(1);
    expect(result.protocols[0].matchScore).toBe(1);
    expect(result.protocols[0].matchedLabelCodes).toEqual(['ANTI_AGING']);
  });

  it('should exclude protocols with no matching labels', async () => {
    const oilyLabel = makeLabel({ id: 'label-oily' });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-other',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-oily']);

    expect(result.protocols).toHaveLength(0);
  });

  it('should rank protocols by matchScore descending', async () => {
    const labelA = makeLabel({ id: 'label-a', code: 'LABEL_A' });
    const labelB = makeLabel({ id: 'label-b', code: 'LABEL_B' });
    const lowScoreProtocol = makeProtocol({
      id: 'protocol-low',
      code: 'LOW',
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-a',
          matchType: LabelMatchType.REQUIRED,
        }),
      ],
    });
    const highScoreProtocol = makeProtocol({
      id: 'protocol-high',
      code: 'HIGH',
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-a',
          matchType: LabelMatchType.REQUIRED,
        }),
        makeProtocolLabel({
          id: 'pl-2',
          labelId: 'label-b',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([labelA, labelB]);
    protocolRepository.find.mockResolvedValue([
      lowScoreProtocol,
      highScoreProtocol,
    ]);

    const result = await service.buildRoutineContext(['label-a', 'label-b']);

    expect(result.protocols.map((p) => p.code)).toEqual(['HIGH', 'LOW']);
    expect(result.protocols[0].matchScore).toBe(2);
    expect(result.protocols[1].matchScore).toBe(1);
  });

  it('should deduplicate duplicate labelIds before loading', async () => {
    const oilyLabel = makeLabel({ id: 'label-oily' });
    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([]);

    await service.buildRoutineContext(['label-oily', 'label-oily']);

    expect(labelRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.objectContaining({ _value: ['label-oily'] }),
        isActive: true,
      },
    });
  });

  it('should only include active labels from repository results', async () => {
    labelRepository.find.mockResolvedValue([]);
    protocolRepository.find.mockResolvedValue([]);

    const result = await service.buildRoutineContext(['inactive-label-id']);

    expect(result.labels).toHaveLength(0);
    expect(labelRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.objectContaining({
          _value: ['inactive-label-id'],
        }),
        isActive: true,
      },
    });
  });

  it('should exclude protocols when skin type is AVOID', async () => {
    const oilyLabel = makeLabel({ id: 'label-oily', code: 'OILY_SKIN' });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-oily',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
      protocolSkinTypes: [
        makeProtocolSkinType({
          skinTypeId: 'skin-type-1',
          recommendation: SkinTypeRecommendation.AVOID,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-oily'], {
      skinTypeId: 'skin-type-1',
    });

    expect(result.protocols).toHaveLength(0);
  });

  it('should boost matchScore when skin type is RECOMMENDED', async () => {
    const oilyLabel = makeLabel({ id: 'label-oily', code: 'OILY_SKIN' });
    const protocol = makeProtocol({
      protocolLabels: [
        makeProtocolLabel({
          labelId: 'label-oily',
          matchType: LabelMatchType.OPTIONAL,
        }),
      ],
      protocolSkinTypes: [
        makeProtocolSkinType({
          skinTypeId: 'skin-type-1',
          recommendation: SkinTypeRecommendation.RECOMMENDED,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([oilyLabel]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext(['label-oily'], {
      skinTypeId: 'skin-type-1',
    });

    expect(result.protocols).toHaveLength(1);
    expect(result.protocols[0].matchScore).toBe(2);
    expect(result.protocols[0].matchedLabelCodes).toEqual([
      'OILY_SKIN',
      'OSPW',
    ]);
  });

  it('should keep protocol when matched only by RECOMMENDED skin type', async () => {
    const protocol = makeProtocol({
      protocolLabels: [],
      protocolSkinTypes: [
        makeProtocolSkinType({
          skinTypeId: 'skin-type-1',
          recommendation: SkinTypeRecommendation.RECOMMENDED,
        }),
      ],
    });

    labelRepository.find.mockResolvedValue([]);
    protocolRepository.find.mockResolvedValue([protocol]);

    const result = await service.buildRoutineContext([], {
      skinTypeId: 'skin-type-1',
    });

    expect(result.protocols).toHaveLength(1);
    expect(result.protocols[0].matchScore).toBe(1);
    expect(result.protocols[0].matchedLabelCodes).toEqual(['OSPW']);
  });

  describe('buildContextForCustomer', () => {
    it('should throw NotFoundException when customer does not exist', async () => {
      customerRepository.findOne.mockResolvedValue(null);

      await expect(
        service.buildContextForCustomer('missing-customer'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should resolve profile labels, survey labels, and return customer profile', async () => {
      const customer = makeCustomer();
      const ageLabel = makeLabel({
        id: 'label-age',
        code: 'AGE_26_35',
        name: '26–35',
      });
      const genderLabel = makeLabel({
        id: 'label-gender',
        code: 'FEMALE',
        name: 'Female',
      });
      const surveyLabel = makeLabel({
        id: 'label-acne',
        code: 'ACNE',
        name: 'Acne',
      });
      const protocol = makeProtocol({
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-acne',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });

      customerRepository.findOne.mockResolvedValue(customer);
      customerSurveyRepository.findOne.mockResolvedValue({
        id: 'survey-1',
        customerId: 'customer-1',
        isCompleted: true,
        completedAt: new Date(),
        answers: [
          {
            id: 'answer-1',
            surveyId: 'survey-1',
            questionId: 'question-1',
            value: null,
            answerLabels: [
              { id: 'al-1', answerId: 'answer-1', labelId: 'label-acne' },
            ] as AnswerLabel[],
            createdAt: new Date(),
            updatedAt: new Date(),
          } as Answer,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CustomerSurvey);

      labelRepository.find
        .mockResolvedValueOnce([ageLabel, genderLabel])
        .mockResolvedValueOnce([ageLabel, genderLabel, surveyLabel]);
      protocolRepository.find.mockResolvedValue([protocol]);

      const result = await service.buildContextForCustomer('customer-1');

      expect(customerRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        relations: ['skinTypeDetails', 'skinTypeDetails.skinType'],
      });
      expect(customerSurveyRepository.findOne).toHaveBeenCalledWith({
        where: { customerId: 'customer-1', isCompleted: true },
        relations: ['answers', 'answers.answerLabels', 'faceLabels'],
        order: { completedAt: 'DESC' },
      });
      expect(labelRepository.find).toHaveBeenNthCalledWith(1, {
        where: {
          code: expect.objectContaining({
            _value: ['AGE_26_35', 'FEMALE'],
          }),
          isActive: true,
        },
      });
      expect(result.customerProfile).toEqual({
        age: expect.any(Number),
        gender: Gender.FEMALE,
        skinTypeCode: 'OSPW',
        skinTypeName: 'Oily Sensitive Pigmented Wrinkled',
      });
      expect(result.labels).toHaveLength(3);
      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0].matchedLabelCodes).toContain('ACNE');
    });

    it('should use gender enum value as label code', async () => {
      const customer = makeCustomer({ gender: Gender.MALE });

      customerRepository.findOne.mockResolvedValue(customer);
      customerSurveyRepository.findOne.mockResolvedValue(null);
      labelRepository.find
        .mockResolvedValueOnce([
          makeLabel({ id: 'label-age', code: 'AGE_26_35' }),
          makeLabel({ id: 'label-male', code: 'MALE' }),
        ])
        .mockResolvedValueOnce([]);
      protocolRepository.find.mockResolvedValue([]);

      await service.buildContextForCustomer('customer-1');

      expect(labelRepository.find).toHaveBeenNthCalledWith(1, {
        where: {
          code: expect.objectContaining({
            _value: expect.arrayContaining(['AGE_26_35', 'MALE']),
          }),
          isActive: true,
        },
      });
    });

    it('should use only profile labels when no completed survey exists', async () => {
      const customer = makeCustomer({
        gender: Gender.NOT_PREFER_TO_SAY,
        dateOfBirth: null,
      });
      const genderLabel = makeLabel({
        id: 'label-gender',
        code: 'NOT_PREFER_TO_SAY',
        name: 'Prefer not to say',
      });

      customerRepository.findOne.mockResolvedValue(customer);
      customerSurveyRepository.findOne.mockResolvedValue(null);
      labelRepository.find
        .mockResolvedValueOnce([genderLabel])
        .mockResolvedValueOnce([genderLabel]);
      protocolRepository.find.mockResolvedValue([]);

      const result = await service.buildContextForCustomer('customer-1');

      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].code).toBe('NOT_PREFER_TO_SAY');
      expect(result.customerProfile).toEqual({
        age: null,
        gender: Gender.NOT_PREFER_TO_SAY,
        skinTypeCode: 'OSPW',
        skinTypeName: 'Oily Sensitive Pigmented Wrinkled',
      });
    });
  });

  describe('buildContextFromProfile', () => {
    it('uses age, gender, skin type, and allergies without loading survey labels', async () => {
      const customer = makeCustomer();
      const ageLabel = makeLabel({
        id: 'label-age',
        code: 'AGE_26_35',
      });
      const genderLabel = makeLabel({
        id: 'label-gender',
        code: 'FEMALE',
      });
      const allergyLabel = makeLabel({
        id: 'label-allergy',
        code: 'SALICYLIC_ACID',
      });
      const safeProtocol = makeProtocol({
        id: 'protocol-safe',
        code: 'SAFE',
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-gender',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });
      const allergicProtocol = makeProtocol({
        id: 'protocol-allergic',
        code: 'ALLERGIC',
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-allergy',
            matchType: LabelMatchType.EXCLUDED,
          }),
          makeProtocolLabel({
            labelId: 'label-gender',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });

      customerRepository.findOne.mockResolvedValue(customer);
      customerAllergyRepository.find.mockResolvedValue([
        {
          id: 'allergy-1',
          customerId: customer.id,
          customer,
          labelId: allergyLabel.id,
          label: allergyLabel,
          createdAt: new Date(),
        },
      ]);
      labelRepository.find
        .mockResolvedValueOnce([ageLabel, genderLabel])
        .mockResolvedValueOnce([ageLabel, genderLabel, allergyLabel]);
      protocolRepository.find.mockResolvedValue([
        allergicProtocol,
        safeProtocol,
      ]);

      const result = await service.buildContextFromProfile(customer.id);

      expect(customerSurveyRepository.findOne).not.toHaveBeenCalled();
      expect(customerAllergyRepository.find).toHaveBeenCalledWith({
        where: { customerId: customer.id },
        relations: ['label'],
      });
      expect(result.labels.map((label) => label.code)).toEqual(
        expect.arrayContaining(['AGE_26_35', 'FEMALE', 'SALICYLIC_ACID']),
      );
      expect(result.customerProfile).toEqual({
        age: expect.any(Number),
        gender: Gender.FEMALE,
        skinTypeCode: 'OSPW',
        skinTypeName: 'Oily Sensitive Pigmented Wrinkled',
      });
      expect(result.protocols.map((protocol) => protocol.id)).toEqual([
        'protocol-safe',
      ]);
    });

    it('applies baseline match when profile has no overlapping survey labels', async () => {
      const customer = makeCustomer({
        skinTypeDetails: {
          id: 'std-1',
          customerId: 'customer-1',
          skinTypeId: null,
          oilyDryScore: null,
          sensitiveResistantScore: null,
          pigmentedNonPigmentedScore: null,
          wrinkledTightScore: null,
          assessedAt: null,
          skinType: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as CustomerSkinTypeDetails,
      });
      const ageLabel = makeLabel({ id: 'label-age', code: 'AGE_26_35' });
      const genderLabel = makeLabel({ id: 'label-gender', code: 'FEMALE' });
      const unmatchedProtocol = makeProtocol({
        id: 'protocol-unmatched',
        code: 'UNMATCHED',
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-acne',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });

      customerRepository.findOne.mockResolvedValue(customer);
      customerAllergyRepository.find.mockResolvedValue([]);
      labelRepository.find
        .mockResolvedValueOnce([ageLabel, genderLabel])
        .mockResolvedValueOnce([ageLabel, genderLabel]);
      protocolRepository.find.mockResolvedValue([unmatchedProtocol]);

      const result = await service.buildContextFromProfile(customer.id);

      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0]).toEqual(
        expect.objectContaining({
          id: 'protocol-unmatched',
          matchScore: 1,
        }),
      );
    });
  });

  describe('seeded survey demo cases (docs §10.5)', () => {
    function buildSeedProtocols(): IngredientProtocol[] {
      const byCode = new Map<string, IngredientProtocol>();
      for (const mapping of SEED_PROTOCOL_LABELS) {
        let protocol = byCode.get(mapping.protocolCode);
        if (!protocol) {
          protocol = makeProtocol({
            id: `protocol-${mapping.protocolCode}`,
            code: mapping.protocolCode,
            name: mapping.protocolCode,
            protocolLabels: [],
            protocolSkinTypes: [],
          });
          byCode.set(mapping.protocolCode, protocol);
        }
        protocol.protocolLabels.push(
          makeProtocolLabel({
            id: `pl-${mapping.protocolCode}-${mapping.labelCode}`,
            protocolId: protocol.id,
            labelId: `label-${mapping.labelCode}`,
            matchType: mapping.matchType,
          }),
        );
      }
      return [...byCode.values()];
    }

    for (const demoCase of SURVEY_DEMO_CASES) {
      it(`${demoCase.name}: rule engine returns expected protocol themes`, async () => {
        const labels = demoCase.labels.map((code) =>
          makeLabel({ id: `label-${code}`, code, name: code }),
        );
        labelRepository.find.mockResolvedValue(labels);
        protocolRepository.find.mockResolvedValue(buildSeedProtocols());

        const result = await service.buildRoutineContext(
          labels.map((label) => label.id),
        );

        const matchedCodes = result.protocols.map((p) => p.code);
        expect(matchedCodes.length).toBeGreaterThan(0);
        for (const code of demoCase.expectedProtocolCodes) {
          expect(matchedCodes).toContain(code);
        }
      });
    }

    it('anti-aging + PREGNANCY excludes retinol but keeps other matches', async () => {
      const antiAging = SURVEY_DEMO_CASES.find((c) => c.name === 'Anti-aging')!;
      const codes = [...antiAging.labels, 'PREGNANCY'];
      const labels = codes.map((code) =>
        makeLabel({ id: `label-${code}`, code, name: code }),
      );
      labelRepository.find.mockResolvedValue(labels);
      protocolRepository.find.mockResolvedValue(buildSeedProtocols());

      const result = await service.buildRoutineContext(
        labels.map((label) => label.id),
      );
      const matchedCodes = result.protocols.map((p) => p.code);

      expect(matchedCodes).not.toContain('retinol_0.3_anti_aging');
      expect(matchedCodes).toContain('niacinamide_general');
    });

    it('personality / skin-type signal labels do not prevent concern matching', async () => {
      const acne = SURVEY_DEMO_CASES.find((c) => c.name === 'Acne / oily')!;
      expect(acne.labels).toEqual(
        expect.arrayContaining([
          'OILY_TENDENCY',
          'PERSONALITY_QUICK_RESULT',
          'ACNE_TREATMENT',
        ]),
      );

      const labels = acne.labels.map((code) =>
        makeLabel({ id: `label-${code}`, code, name: code }),
      );
      labelRepository.find.mockResolvedValue(labels);
      protocolRepository.find.mockResolvedValue(buildSeedProtocols());

      const result = await service.buildRoutineContext(
        labels.map((label) => label.id),
      );
      expect(result.protocols.map((p) => p.code)).toEqual(
        expect.arrayContaining(['salicylic_acne', 'benzoyl_acne']),
      );
    });
  });

  describe('face AI label weighting', () => {
    it('scores AI-only OPTIONAL match at 0.5 vs survey at 1.0', async () => {
      const acne = makeLabel({
        id: 'label-acne-treatment',
        code: 'ACNE_TREATMENT',
      });
      const protocol = makeProtocol({
        code: 'salicylic_acne',
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-acne-treatment',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });
      labelRepository.find.mockResolvedValue([acne]);
      protocolRepository.find.mockResolvedValue([protocol]);

      const surveyResult = await service.buildRoutineContext([
        'label-acne-treatment',
      ]);
      expect(surveyResult.protocols[0].matchScore).toBe(1);

      const faceResult = await service.buildRoutineContext([], {
        faceLabelIds: ['label-acne-treatment'],
        labelSources: {
          profileLabelIds: new Set(),
          surveyLabelIds: new Set(),
          faceLabelIds: new Set(['label-acne-treatment']),
        },
      });
      expect(faceResult.protocols[0].matchScore).toBe(0.5);
      expect(faceResult.labels[0]).toMatchObject({
        source: 'FACE_AI',
        weight: 0.5,
      });
    });

    it('does not unlock REQUIRED protocols from AI-only labels', async () => {
      const oily = makeLabel({ id: 'label-oily', code: 'OILY_SKIN' });
      const protocol = makeProtocol({
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-oily',
            matchType: LabelMatchType.REQUIRED,
          }),
        ],
      });
      labelRepository.find.mockResolvedValue([oily]);
      protocolRepository.find.mockResolvedValue([protocol]);

      const result = await service.buildRoutineContext([], {
        faceLabelIds: ['label-oily'],
      });
      expect(result.protocols).toHaveLength(0);
    });

    it('does not exclude protocols from AI-only EXCLUDED labels', async () => {
      const pregnancy = makeLabel({
        id: 'label-pregnancy',
        code: 'PREGNANCY',
      });
      const antiAging = makeLabel({
        id: 'label-anti-aging',
        code: 'ANTI_AGING',
      });
      const protocol = makeProtocol({
        code: 'retinol',
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-anti-aging',
            matchType: LabelMatchType.OPTIONAL,
          }),
          makeProtocolLabel({
            labelId: 'label-pregnancy',
            matchType: LabelMatchType.EXCLUDED,
          }),
        ],
      });
      labelRepository.find.mockResolvedValue([pregnancy, antiAging]);
      protocolRepository.find.mockResolvedValue([protocol]);

      const result = await service.buildRoutineContext(['label-anti-aging'], {
        faceLabelIds: ['label-pregnancy'],
      });
      expect(result.protocols).toHaveLength(1);
      expect(result.protocols[0].code).toBe('retinol');
    });

    it('does not score above 1.0 when survey and AI share the same OPTIONAL label', async () => {
      const acne = makeLabel({
        id: 'label-acne-treatment',
        code: 'ACNE_TREATMENT',
      });
      const protocol = makeProtocol({
        protocolLabels: [
          makeProtocolLabel({
            labelId: 'label-acne-treatment',
            matchType: LabelMatchType.OPTIONAL,
          }),
        ],
      });
      labelRepository.find.mockResolvedValue([acne]);
      protocolRepository.find.mockResolvedValue([protocol]);

      const result = await service.buildRoutineContext(
        ['label-acne-treatment'],
        {
          faceLabelIds: ['label-acne-treatment'],
          labelSources: {
            profileLabelIds: new Set(),
            surveyLabelIds: new Set(['label-acne-treatment']),
            faceLabelIds: new Set(['label-acne-treatment']),
          },
        },
      );
      expect(result.protocols[0].matchScore).toBe(1);
      expect(result.labels[0]).toMatchObject({
        source: 'SURVEY',
        weight: 1,
      });
    });
  });
});
