import { Repository } from 'typeorm';
import { LabelMatchType, TimeOfUse } from '../ingredients/enums';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { Label } from '../survey/label.entity';
import { RuleEngineService } from './rule-engine.service';

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

describe('RuleEngineService', () => {
  let labelRepository: jest.Mocked<Pick<Repository<Label>, 'find'>>;
  let protocolRepository: jest.Mocked<
    Pick<Repository<IngredientProtocol>, 'find'>
  >;
  let service: RuleEngineService;

  beforeEach(() => {
    labelRepository = {
      find: jest.fn(),
    };
    protocolRepository = {
      find: jest.fn(),
    };
    service = new RuleEngineService(
      labelRepository as unknown as Repository<Label>,
      protocolRepository as unknown as Repository<IngredientProtocol>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty context when labelIds is empty', async () => {
    protocolRepository.find.mockResolvedValue([]);

    const result = await service.buildRoutineContext([]);

    expect(result).toEqual({ labels: [], protocols: [] });
    expect(labelRepository.find).not.toHaveBeenCalled();
    expect(protocolRepository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      relations: ['protocolLabels', 'ingredient'],
    });
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
});
