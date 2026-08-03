export const SKIN_VISION_PROVIDER = Symbol('SKIN_VISION_PROVIDER');

export type SkinVisionAnalyzeInput = {
  imageUrl: string;
  imageBase64: string;
  mimeType: string;
};

export type SkinVisionFinding = {
  labelCode: string;
  /** Short EN sentence explaining why this label was inferred from the photo. */
  explanation: string;
};

export type SkinVisionAnalyzeOutput = {
  findings: SkinVisionFinding[];
};

export interface SkinVisionProvider {
  analyze(input: SkinVisionAnalyzeInput): Promise<SkinVisionAnalyzeOutput>;
}

/** Existing taxonomy codes the mock / Ollama vision may emit. */
export const SKIN_VISION_LABEL_ALLOWLIST = [
  'ACNE',
  'OILY_TENDENCY',
  'HYPERPIGMENTATION',
  'REDNESS',
  'DEHYDRATED_SKIN',
  'ENLARGED_PORES',
  'FINE_LINES',
  'BLACKHEADS',
  'ROUGH_TEXTURE',
  'BARRIER_DAMAGE',
] as const;

/** @deprecated Prefer SKIN_VISION_LABEL_ALLOWLIST */
export const MOCK_SKIN_VISION_LABEL_POOL = SKIN_VISION_LABEL_ALLOWLIST;

export const MAX_SKIN_VISION_EXPLANATION_LENGTH = 200;
