import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';

export const LLM_ROUTINE_PROVIDER = Symbol('LLM_ROUTINE_PROVIDER');

export type RoutineGenerationProductInput = {
  productVariantId: string;
  productName: string;
  sku: string;
  protocolId: string | null;
  protocolCode: string | null;
  protocolName: string | null;
  timeOfUse: TimeOfUse | null;
  instructions: string | null;
};

export type RoutineGenerationInput = {
  customerProfile: {
    age: number | null;
    gender: string;
    skinTypeCode: string | null;
  };
  labelCodes: string[];
  products: RoutineGenerationProductInput[];
};

export type RoutineGenerationStepOutput = {
  name: string;
  period: RoutinePeriod;
  stepOrder: number;
  instructions: string;
  productVariantId: string;
  protocolId: string | null;
  amountMl: number | null;
  waitMinutes: number | null;
  dosageText: string | null;
};

export type RoutineGenerationOutput = {
  title: string;
  description: string;
  steps: RoutineGenerationStepOutput[];
};

export interface LlmRoutineProvider {
  generateRoutine(
    input: RoutineGenerationInput,
  ): Promise<RoutineGenerationOutput>;
}
