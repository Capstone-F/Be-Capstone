import { InternalServerErrorException } from '@nestjs/common';
import { RoutinePeriod } from '../routines/enums';
import {
  RoutineGenerationOutput,
  RoutineGenerationStepOutput,
} from './llm-routine.types';

function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InternalServerErrorException(
      `LLM routine response missing or invalid field: ${field}`,
    );
  }
  return value.trim();
}

function parsePeriod(value: unknown): RoutinePeriod {
  if (value === RoutinePeriod.MORNING || value === RoutinePeriod.EVENING) {
    return value;
  }
  throw new InternalServerErrorException(
    `LLM routine response has invalid period: ${String(value)}`,
  );
}

function parseStepOrder(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  throw new InternalServerErrorException(
    'LLM routine response has invalid stepOrder',
  );
}

function coerceProtocolId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  return null;
}

function coerceAmountMl(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function parseStep(raw: unknown, index: number): RoutineGenerationStepOutput {
  if (!raw || typeof raw !== 'object') {
    throw new InternalServerErrorException(
      `LLM routine response step at index ${index} is not an object`,
    );
  }
  const step = raw as Record<string, unknown>;
  return {
    name: requireNonEmptyString(step.name, `steps[${index}].name`),
    period: parsePeriod(step.period),
    stepOrder: parseStepOrder(step.stepOrder),
    instructions: requireNonEmptyString(
      step.instructions,
      `steps[${index}].instructions`,
    ),
    productVariantId: requireNonEmptyString(
      step.productVariantId,
      `steps[${index}].productVariantId`,
    ),
    protocolId: coerceProtocolId(step.protocolId),
    amountMl: coerceAmountMl(step.amountMl),
  };
}

/**
 * Parse and validate LLM JSON content into RoutineGenerationOutput.
 * Throws InternalServerErrorException on unparseable or invalid structure.
 */
export function parseRoutineGenerationOutput(
  content: string,
): RoutineGenerationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(content));
  } catch {
    throw new InternalServerErrorException(
      'LLM routine response is not valid JSON',
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new InternalServerErrorException(
      'LLM routine response must be a JSON object',
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.steps)) {
    throw new InternalServerErrorException(
      'LLM routine response missing steps array',
    );
  }

  return {
    title: requireNonEmptyString(obj.title, 'title'),
    description: requireNonEmptyString(obj.description, 'description'),
    steps: obj.steps.map((step, index) => parseStep(step, index)),
  };
}
