import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LabelMatchType, SkinTypeRecommendation } from '../ingredients/enums';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { ProtocolSkinType } from '../ingredients/protocol-skin-type.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { Customer } from '../users/customer.entity';
import {
  RuleEngineContextDto,
  RuleEngineCustomerProfileDto,
  RuleEngineLabelDto,
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
}

const AGE_GROUP_CODES = [
  { code: 'UNDER_18', min: 0, max: 17 },
  { code: 'AGE_18_25', min: 18, max: 25 },
  { code: 'AGE_26_35', min: 26, max: 35 },
  { code: 'AGE_36_45', min: 36, max: 45 },
  { code: 'AGE_46_60', min: 46, max: 60 },
  { code: 'ABOVE_60', min: 61, max: Infinity },
] as const;

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

    const surveyLabelIds = await this.loadSurveyLabelIds(customerId);
    const labelIds = [...new Set([...profileLabelIds, ...surveyLabelIds])];

    const skinTypeId = customer.skinTypeDetails?.skinTypeId ?? null;

    return this.buildRoutineContext(labelIds, {
      skinTypeId,
      customerProfile: profile,
    });
  }

  async buildRoutineContext(
    labelIds: string[],
    options: BuildRoutineContextOptions = {},
  ): Promise<RuleEngineContextDto> {
    const { skinTypeId = null, customerProfile = null } = options;
    const uniqueLabelIds = [...new Set(labelIds)];

    const labels =
      uniqueLabelIds.length > 0
        ? await this.labelRepository.find({
            where: { id: In(uniqueLabelIds), isActive: true },
          })
        : [];

    const customerLabelIds = new Set(labels.map((label) => label.id));
    const labelCodeById = new Map(
      labels.map((label) => [label.id, label.code]),
    );

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
          customerLabelIds,
          labelCodeById,
          skinTypeId,
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
      labels: labels.map((label) => this.toLabelDto(label)),
      protocols: scoredProtocols.map((result) =>
        this.toProtocolDto(
          result.protocol,
          result.matchScore,
          result.matchedLabelCodes,
        ),
      ),
    };
  }

  private async loadSurveyLabelIds(customerId: string): Promise<string[]> {
    const survey = await this.customerSurveyRepository.findOne({
      where: { customerId, isCompleted: true },
      relations: ['answers', 'answers.answerLabels'],
      order: { completedAt: 'DESC' },
    });

    if (!survey?.answers?.length) {
      return [];
    }

    const labelIds = survey.answers.flatMap(
      (answer) => answer.answerLabels?.map((al) => al.labelId) ?? [],
    );

    return [...new Set(labelIds)];
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
    customerLabelIds: Set<string>,
    labelCodeById: Map<string, string>,
    customerSkinTypeId: string | null,
  ): ScoredProtocol | null {
    const grouped = this.groupProtocolLabels(protocol.protocolLabels ?? []);

    const hasExcludedMatch = grouped.excluded.some((pl) =>
      customerLabelIds.has(pl.labelId),
    );
    if (hasExcludedMatch) {
      return null;
    }

    const allRequiredMatched = grouped.required.every((pl) =>
      customerLabelIds.has(pl.labelId),
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
      customerLabelIds.has(pl.labelId),
    );
    const matchedOptional = grouped.optional.filter((pl) =>
      customerLabelIds.has(pl.labelId),
    );

    const matchScore =
      matchedRequired.length + matchedOptional.length + skinTypeResult.score;
    if (matchScore < 1) {
      return null;
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

  private toLabelDto(label: Label): RuleEngineLabelDto {
    return {
      id: label.id,
      code: label.code,
      name: label.name,
      description: label.description,
      categoryId: label.categoryId,
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
