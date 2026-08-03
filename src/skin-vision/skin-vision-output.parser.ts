import {
  MAX_SKIN_VISION_EXPLANATION_LENGTH,
  SKIN_VISION_LABEL_ALLOWLIST,
  SkinVisionAnalyzeOutput,
  SkinVisionFinding,
} from './skin-vision.types';

const ALLOWED = new Set<string>(SKIN_VISION_LABEL_ALLOWLIST);

type RawPayload = {
  labels?: unknown;
};

/**
 * Parse Ollama / mock-compatible JSON into filtered findings.
 * Unknown codes are dropped; explanations are trimmed and capped.
 */
export function parseSkinVisionOutput(
  content: string,
): SkinVisionAnalyzeOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Skin vision response is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Skin vision response must be a JSON object');
  }

  const labels = (parsed as RawPayload).labels;
  if (!Array.isArray(labels)) {
    throw new Error('Skin vision response missing labels array');
  }

  const findings: SkinVisionFinding[] = [];
  const seen = new Set<string>();

  for (const entry of labels) {
    if (!entry || typeof entry !== 'object') continue;
    const codeRaw = (entry as { code?: unknown }).code;
    const explanationRaw = (entry as { explanation?: unknown }).explanation;
    if (typeof codeRaw !== 'string') continue;
    const labelCode = codeRaw.trim();
    if (!labelCode || !ALLOWED.has(labelCode) || seen.has(labelCode)) continue;
    seen.add(labelCode);

    const explanation =
      typeof explanationRaw === 'string'
        ? explanationRaw.trim().slice(0, MAX_SKIN_VISION_EXPLANATION_LENGTH)
        : '';
    if (!explanation) continue;

    findings.push({ labelCode, explanation });
  }

  return { findings };
}
