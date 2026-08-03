import { SKIN_VISION_LABEL_ALLOWLIST } from './skin-vision.types';

export const OLLAMA_SKIN_VISION_SYSTEM_PROMPT = `You are a cosmetic skin-assessment assistant for GlowScan.
Analyze the facial photo and return ONLY JSON (no markdown) with this shape:
{"labels":[{"code":"ACNE","explanation":"Short reason visible in the photo."}]}

Rules:
- Pick 2 to 6 codes from the allow-list only.
- Each explanation must be one short English sentence (max 200 characters) describing visual evidence.
- Do not invent medical diagnoses; use cosmetic concern language.
- Do not include codes outside the allow-list.
- Do not wrap the JSON in code fences.`;

export function buildOllamaSkinVisionUserPrompt(): string {
  const allowList = SKIN_VISION_LABEL_ALLOWLIST.join(', ');
  return `Allow-listed label codes: ${allowList}

Inspect the attached facial image and return JSON findings for matching codes only.`;
}
