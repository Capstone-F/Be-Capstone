import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LabelMatchType } from '../ingredients/enums';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { Label } from '../survey/label.entity';
import {
  RuleEngineContextDto,
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

@Injectable()
export class RuleEngineService {
  constructor(
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(IngredientProtocol)
    private readonly protocolRepository: Repository<IngredientProtocol>,
  ) {}

  async buildRoutineContext(labelIds: string[]): Promise<RuleEngineContextDto> {
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
      relations: ['protocolLabels', 'ingredient'],
    });

    const scoredProtocols = protocols
      .map((protocol) =>
        this.scoreProtocol(protocol, customerLabelIds, labelCodeById),
      )
      .filter((result): result is ScoredProtocol => result !== null)
      .sort((a, b) => b.matchScore - a.matchScore);

    return {
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

  private scoreProtocol(
    protocol: IngredientProtocol,
    customerLabelIds: Set<string>,
    labelCodeById: Map<string, string>,
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

    const matchedRequired = grouped.required.filter((pl) =>
      customerLabelIds.has(pl.labelId),
    );
    const matchedOptional = grouped.optional.filter((pl) =>
      customerLabelIds.has(pl.labelId),
    );

    const matchScore = matchedRequired.length + matchedOptional.length;
    if (matchScore < 1) {
      return null;
    }

    const matchedLabelCodes = [...matchedRequired, ...matchedOptional]
      .map((pl) => labelCodeById.get(pl.labelId))
      .filter((code): code is string => code !== undefined);

    return { protocol, matchScore, matchedLabelCodes };
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
