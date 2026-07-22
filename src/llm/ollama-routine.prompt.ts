import { RoutineGenerationInput } from './llm-routine.types';

export const OLLAMA_ROUTINE_SYSTEM_PROMPT = `You are a skincare expert that builds personalized morning and evening routines.

Return ONLY a single JSON object (no markdown, no commentary) with this exact shape:
{
  "title": string,
  "description": string,
  "steps": [
    {
      "name": string,
      "period": "MORNING" | "EVENING",
      "stepOrder": number,
      "instructions": string,
      "productVariantId": string,
      "protocolId": string | null,
      "amountMl": number | null
    }
  ]
}

Rules:
- Use ONLY productVariantId values from the provided products list. Never invent product IDs.
- period must be exactly "MORNING" or "EVENING".
- stepOrder must start at 1 within each period and increase sequentially.
- Prefer protocol timeOfUse when choosing MORNING vs EVENING (AM → MORNING, PM → EVENING, AM_PM → both periods).
- protocolId should match the product's protocolId when available, otherwise null.
- amountMl may be null when not specified.
- Write clear, practical instructions tailored to the customer's profile and survey labels.
- Include every purchased product in at least one step when possible.`;

export function buildOllamaRoutineUserPrompt(
  input: RoutineGenerationInput,
): string {
  return [
    'Generate a personalized skincare routine from this input.',
    '',
    'Customer profile:',
    JSON.stringify(input.customerProfile, null, 2),
    '',
    'Survey label codes:',
    JSON.stringify(input.labelCodes, null, 2),
    '',
    'Purchased products (use only these productVariantId values):',
    JSON.stringify(input.products, null, 2),
  ].join('\n');
}
