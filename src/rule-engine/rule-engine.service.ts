import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LabelMatchType, SkinTypeRecommendation } from '../ingredients/enums';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { ProtocolSkinType } from '../ingredients/protocol-skin-type.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import {
  RuleEngineContextDto,
  RuleEngineCustomerProfileDto,
  RuleEngineLabelDto,
  RuleEngineLabelSource,
  RuleEngineProtocolDto,
} from './dto/rule-engine-context.dto';

interface GroupedProtocolLabels {
  required: ProtocolLabel[];
  optional: ProtocolLabel[];
  excluded: ProtocolLabel[];
}

interface ScoredProtocol {
  protocol: IngredientProtocol;
  matchScore: number;
  matchedLabelCodes: string[];
}

interface BuildRoutineContextOptions {
  skinTypeId?: string | null;
  customerProfile?: RuleEngineCustomerProfileDto | null;
  /** When true, protocols that pass exclusion/required/avoid checks get at least score 1. */
  allowBaselineMatch?: boolean;
  /**
   * AI face label ids — never used for REQUIRED/EXCLUDED gates;
   * only boost OPTIONAL matches at weight 0.5.
   */
  faceLabelIds?: string[];
}

const AGE_GROUP_CODES = [
  { code: 'UNDER_18', min: 0, max: 17 },
  { code: 'AGE_18_25', min: 18, max: 25 },
  { code: 'AGE_26_35', min: 26, max: 35 },
  { code: 'AGE_36_45', min: 36, max: 45 },
  { code: 'AGE_46_60', min: 46, max: 60 },
  { code: 'ABOVE_60', min: 61, max: Infinity },
] as const;

const SURVEY_LABEL_WEIGHT = 1;
const FACE_AI_LABEL_WEIGHT = 0.5;

@Injectable()
export class RuleEngineService {
  constructor(
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(IngredientProtocol)
    private readonly protocolRepository: Repository<IngredientProtocol>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerSurvey)
    private readonly customerSurveyRepository: Repository<CustomerSurvey>,
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
  ) {}

  async buildContextForCustomer(
    customerId: string,
  ): Promise<RuleEngineContextDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['skinTypeDetails', 'skinTypeDetails.skinType'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const profile = this.toProfileDto(customer);
    const profileLabelCodes = this.deriveProfileLabelCodes(customer);
    const profileLabelIds =
      await this.resolveLabelIdsByCodes(profileLabelCodes);

    const { surveyLabelIds, faceLabelIds } =
      await this.loadCompletedSurveyLabelIds(customerId);
    const authoritativeLabelIds = [
      ...new Set([...profileLabelIds, ...surveyLabelIds]),
    ];

    const skinTypeId = customer.skinTypeDetails?.skinTypeId ?? null;

    return this.buildRoutineContext(authoritativeLabelIds, {
      skinTypeId,
      customerProfile: profile,
      faceLabelIds,
      labelSources: {
        profileLabelIds: new Set(profileLabelIds),
        surveyLabelIds: new Set(surveyLabelIds),
        faceLabelIds: new Set(faceLabelIds),
      },
    });
  }

  async buildContextFromProfile(
    customerId: string,
  ): Promise<RuleEngineContextDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['skinTypeDetails', 'skinTypeDetails.skinType'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const profileLabelCodes = this.deriveProfileLabelCodes(customer);
    const [profileLabelIds, allergies] = await Promise.all([
      this.resolveLabelIdsByCodes(profileLabelCodes),
      this.customerAllergyRepository.find({
        where: { customerId },
        relations: ['label'],
      }),
    ]);
    const allergyLabelIds = allergies
      .filter((allergy) => allergy.label?.isActive)
      .map((allergy) => allergy.labelId);
    const labelIds = [...new Set([...profileLabelIds, ...allergyLabelIds])];

    return this.buildRoutineContext(labelIds, {
      skinTypeId: customer.skinTypeDetails?.skinTypeId ?? null,
      customerProfile: this.toProfileDto(customer),
      allowBaselineMatch: true,
      labelSources: {
        profileLabelIds: new Set(labelIds),
        surveyLabelIds: new Set(),
        faceLabelIds: new Set(),
      },
    });
  }

  async buildRoutineContext(
    labelIds: string[],
    options: BuildRoutineContextOptions & {
      labelSources?: {
        profileLabelIds: Set<string>;
        surveyLabelIds: Set<string>;
        faceLabelIds: Set<string>;
      };
    } = {},
  ): Promise<RuleEngineContextDto> {
    const {
      skinTypeId = null,
      customerProfile = null,
      allowBaselineMatch = false,
      faceLabelIds = [],
      labelSources,
    } = options;

    const authoritativeIds = [...new Set(labelIds)];
    const faceIds = [...new Set(faceLabelIds)];
    const allLabelIds = [...new Set([...authoritativeIds, ...faceIds])];

    const labels =
      allLabelIds.length > 0
        ? await this.labelRepository.find({
            where: { id: In(allLabelIds), isActive: true },
          })
        : [];

    const authoritativeSet = new Set(
      labels
        .filter((label) => authoritativeIds.includes(label.id))
        .map((label) => label.id),
    );
    const faceSet = new Set(
      labels
        .filter((label) => faceIds.includes(label.id))
        .map((label) => label.id),
    );
    const optionalMatchSet = new Set([...authoritativeSet, ...faceSet]);
    const labelCodeById = new Map(
      labels.map((label) => [label.id, label.code]),
    );
    const weightByLabelId = new Map<string, number>();
    for (const id of authoritativeSet) {
      weightByLabelId.set(id, SURVEY_LABEL_WEIGHT);
    }
    for (const id of faceSet) {
      const existing = weightByLabelId.get(id) ?? 0;
      weightByLabelId.set(id, Math.max(existing, FACE_AI_LABEL_WEIGHT));
    }

    const sources = labelSources ?? {
      profileLabelIds: authoritativeSet,
      surveyLabelIds: new Set<string>(),
      faceLabelIds: faceSet,
    };

    const protocols = await this.protocolRepository.find({
      where: { isActive: true },
      relations: [
        'protocolLabels',
        'protocolSkinTypes',
        'protocolSkinTypes.skinType',
        'ingredient',
      ],
    });

    const scoredProtocols = protocols
      .map((protocol) =>
        this.scoreProtocol(
          protocol,
          authoritativeSet,
          optionalMatchSet,
          weightByLabelId,
          labelCodeById,
          skinTypeId,
          allowBaselineMatch,
        ),
      )
      .filter((result): result is ScoredProtocol => result !== null)
      .sort(
        (a, b) =>
          b.matchScore - a.matchScore ||
          a.protocol.code.localeCompare(b.protocol.code),
      );

    return {
      customerProfile,
      labels: labels.map((label) =>
        this.toLabelDto(label, this.resolveLabelSource(label.id, sources)),
      ),
      protocols: scoredProtocols.map((result) =>
        this.toProtocolDto(
          result.protocol,
          result.matchScore,
          result.matchedLabelCodes,
        ),
      ),
    };
  }

  private resolveLabelSource(
    labelId: string,
    sources: {
      profileLabelIds: Set<string>;
      surveyLabelIds: Set<string>;
      faceLabelIds: Set<string>;
    },
  ): { source: RuleEngineLabelSource; weight: number } {
    if (sources.surveyLabelIds.has(labelId)) {
      return { source: 'SURVEY', weight: SURVEY_LABEL_WEIGHT };
    }
    if (sources.profileLabelIds.has(labelId)) {
      return { source: 'PROFILE', weight: SURVEY_LABEL_WEIGHT };
    }
    if (sources.faceLabelIds.has(labelId)) {
      return { source: 'FACE_AI', weight: FACE_AI_LABEL_WEIGHT };
    }
    return { source: 'SURVEY', weight: SURVEY_LABEL_WEIGHT };
  }

  private async loadCompletedSurveyLabelIds(customerId: string): Promise<{
    surveyLabelIds: string[];
    faceLabelIds: string[];
  }> {
    const survey = await this.customerSurveyRepository.findOne({
      where: { customerId, isCompleted: true },
      relations: ['answers', 'answers.answerLabels', 'faceLabels'],
      order: { completedAt: 'DESC' },
    });

    if (!survey) {
      return { surveyLabelIds: [], faceLabelIds: [] };
    }

    const surveyLabelIds = [
      ...new Set(
        (survey.answers ?? []).flatMap(
          (answer) => answer.answerLabels?.map((al) => al.labelId) ?? [],
        ),
      ),
    ];
    const faceLabelIds = [
      ...new Set(
        (survey.faceLabels ?? []).map((faceLabel) => faceLabel.labelId),
      ),
    ];

    return { surveyLabelIds, faceLabelIds };
  }

  private deriveProfileLabelCodes(customer: Customer): string[] {
    const codes: string[] = [];

    const ageGroupCode = this.deriveAgeGroupCode(customer.dateOfBirth);
    if (ageGroupCode) {
      codes.push(ageGroupCode);
    }

    codes.push(customer.gender);

    return codes;
  }

  private deriveAgeGroupCode(dateOfBirth: Date | null): string | null {
    if (!dateOfBirth) {
      return null;
    }

    const age = this.computeAge(dateOfBirth);
    const group = AGE_GROUP_CODES.find(
      (entry) => age >= entry.min && age <= entry.max,
    );

    return group?.code ?? null;
  }

  private computeAge(dateOfBirth: Date): number {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age -= 1;
    }

    return age;
  }

  private async resolveLabelIdsByCodes(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }

    const labels = await this.labelRepository.find({
      where: { code: In(codes), isActive: true },
    });

    return labels.map((label) => label.id);
  }

  private toProfileDto(customer: Customer): RuleEngineCustomerProfileDto {
    const skinType = customer.skinTypeDetails?.skinType ?? null;

    return {
      age: customer.dateOfBirth ? this.computeAge(customer.dateOfBirth) : null,
      gender: customer.gender,
      skinTypeCode: skinType?.code ?? null,
      skinTypeName: skinType?.name ?? null,
    };
  }

  private scoreProtocol(
    protocol: IngredientProtocol,
    authoritativeLabelIds: Set<string>,
    optionalMatchLabelIds: Set<string>,
    weightByLabelId: Map<string, number>,
    labelCodeById: Map<string, string>,
    customerSkinTypeId: string | null,
    allowBaselineMatch = false,
  ): ScoredProtocol | null {
    const grouped = this.groupProtocolLabels(protocol.protocolLabels ?? []);

    const hasExcludedMatch = grouped.excluded.some((pl) =>
      authoritativeLabelIds.has(pl.labelId),
    );
    if (hasExcludedMatch) {
      return null;
    }

    const allRequiredMatched = grouped.required.every((pl) =>
      authoritativeLabelIds.has(pl.labelId),
    );
    if (!allRequiredMatched) {
      return null;
    }

    const skinTypeResult = this.scoreSkinTypeMatch(
      protocol.protocolSkinTypes ?? [],
      customerSkinTypeId,
    );
    if (skinTypeResult === null) {
      return null;
    }

    const matchedRequired = grouped.required.filter((pl) =>
      authoritativeLabelIds.has(pl.labelId),
    );
    const matchedOptional = grouped.optional.filter((pl) =>
      optionalMatchLabelIds.has(pl.labelId),
    );

    let matchScore =
      matchedRequired.reduce(
        (sum, pl) =>
          sum + (weightByLabelId.get(pl.labelId) ?? SURVEY_LABEL_WEIGHT),
        0,
      ) +
      matchedOptional.reduce(
        (sum, pl) =>
          sum + (weightByLabelId.get(pl.labelId) ?? SURVEY_LABEL_WEIGHT),
        0,
      ) +
      skinTypeResult.score;

    if (matchScore <= 0) {
      if (!allowBaselineMatch) {
        return null;
      }
      matchScore = 1;
    }

    const matchedLabelCodes = [
      ...[...matchedRequired, ...matchedOptional]
        .map((pl) => labelCodeById.get(pl.labelId))
        .filter((code): code is string => code !== undefined),
      ...skinTypeResult.matchedCodes,
    ];

    return { protocol, matchScore, matchedLabelCodes };
  }

  private scoreSkinTypeMatch(
    protocolSkinTypes: ProtocolSkinType[],
    customerSkinTypeId: string | null,
  ): { score: number; matchedCodes: string[] } | null {
    if (!customerSkinTypeId || protocolSkinTypes.length === 0) {
      return { score: 0, matchedCodes: [] };
    }

    const hasAvoidMatch = protocolSkinTypes.some(
      (pst) =>
        pst.skinTypeId === customerSkinTypeId &&
        pst.recommendation === SkinTypeRecommendation.AVOID,
    );
    if (hasAvoidMatch) {
      return null;
    }

    const hasRecommendedMatch = protocolSkinTypes.some(
      (pst) =>
        pst.skinTypeId === customerSkinTypeId &&
        pst.recommendation === SkinTypeRecommendation.RECOMMENDED,
    );

    if (hasRecommendedMatch) {
      const skinTypeCode =
        protocolSkinTypes.find(
          (pst) =>
            pst.skinTypeId === customerSkinTypeId &&
            pst.recommendation === SkinTypeRecommendation.RECOMMENDED,
        )?.skinType?.code ?? `SKIN_TYPE:${customerSkinTypeId}`;

      return { score: 1, matchedCodes: [skinTypeCode] };
    }

    return { score: 0, matchedCodes: [] };
  }

  private groupProtocolLabels(
    protocolLabels: ProtocolLabel[],
  ): GroupedProtocolLabels {
    return {
      required: protocolLabels.filter(
        (pl) => pl.matchType === LabelMatchType.REQUIRED,
      ),
      optional: protocolLabels.filter(
        (pl) => pl.matchType === LabelMatchType.OPTIONAL,
      ),
      excluded: protocolLabels.filter(
        (pl) => pl.matchType === LabelMatchType.EXCLUDED,
      ),
    };
  }

  private toLabelDto(
    label: Label,
    meta: { source: RuleEngineLabelSource; weight: number },
  ): RuleEngineLabelDto {
    return {
      id: label.id,
      code: label.code,
      name: label.name,
      description: label.description,
      categoryId: label.categoryId,
      source: meta.source,
      weight: meta.weight,
    };
  }

  private toProtocolDto(
    protocol: IngredientProtocol,
    matchScore: number,
    matchedLabelCodes: string[],
  ): RuleEngineProtocolDto {
    return {
      id: protocol.id,
      code: protocol.code,
      name: protocol.name,
      ingredientName: protocol.ingredient?.name ?? '',
      concentrationPct:
        protocol.concentrationPct !== null
          ? Number(protocol.concentrationPct)
          : null,
      timePerWeek:
        protocol.timePerWeek !== null ? Number(protocol.timePerWeek) : null,
      timeOfUse: protocol.timeOfUse,
      durationWeeks: protocol.durationWeeks,
      instructions: protocol.instructions,
      matchScore,
      matchedLabelCodes,
    };
  }
}
