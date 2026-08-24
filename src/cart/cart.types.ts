import { OrderSource } from '../commerce/enums';

export type CartItem = {
  productVariantId: string;
  quantity: number;
};

export type CartState = {
  source: OrderSource | null;
  surveyRecommendationId: string | null;
  treatmentPhaseId: string | null;
  items: CartItem[];
};

export function emptyCart(): CartState {
  return {
    source: null,
    surveyRecommendationId: null,
    treatmentPhaseId: null,
    items: [],
  };
}
