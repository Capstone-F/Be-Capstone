export const SKIN_VISION_PROVIDER = Symbol('SKIN_VISION_PROVIDER');

export type SkinVisionAnalyzeInput = {
  imageUrl: string;
};

export type SkinVisionAnalyzeOutput = {
  labelCodes: string[];
};

export interface SkinVisionProvider {
  analyze(input: SkinVisionAnalyzeInput): Promise<SkinVisionAnalyzeOutput>;
}

/** Existing taxonomy codes the mock may emit (concern + skin-type signals). */
export const MOCK_SKIN_VISION_LABEL_POOL = [
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
