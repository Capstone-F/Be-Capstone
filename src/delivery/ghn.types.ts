/**
 * GHN REST API request/response shapes.
 *
 * Field names are snake_case/PascalCase to match GHN's wire format exactly — do not
 * camelCase them. Every GHN response is wrapped in `GhnEnvelope`.
 */

export type GhnEnvelope<T> = {
  code: number;
  message: string;
  data: T;
  code_message?: string;
};

export type GhnProvince = {
  ProvinceID: number;
  ProvinceName: string;
};

export type GhnDistrict = {
  DistrictID: number;
  DistrictName: string;
  ProvinceID: number;
};

export type GhnWard = {
  WardCode: string;
  WardName: string;
  DistrictID: number;
};

export type GhnFeeRequest = {
  from_district_id?: number;
  from_ward_code?: string;
  service_type_id?: number;
  to_district_id: number;
  to_ward_code: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  insurance_value?: number;
  cod_value?: number;
};

export type GhnFeeData = {
  total: number;
  service_fee?: number;
  insurance_fee?: number;
  cod_fee?: number;
};

export type GhnCreateOrderItem = {
  name: string;
  quantity: number;
  /** Grams. */
  weight: number;
  code?: string;
  price?: number;
};

export type GhnCreateOrderRequest = {
  to_name: string;
  to_phone: string;
  to_address: string;
  to_ward_code: string;
  to_district_id: number;
  /** Grams, GHN max 30000. */
  weight: number;
  /** cm, GHN max 150. */
  length: number;
  width: number;
  height: number;
  service_type_id: number;
  /** 1 = shop pays GHN, 2 = buyer pays. */
  payment_type_id: number;
  required_note: string;
  items: GhnCreateOrderItem[];
  /** Our Order.id — GHN echoes this back on the webhook as ClientOrderCode. Max 50 chars. */
  client_order_code?: string;
  cod_amount?: number;
  insurance_value?: number;
  content?: string;
  note?: string;
};

export type GhnCreateOrderData = {
  order_code: string;
  expected_delivery_time: string;
  total_fee: number;
  sort_code?: string;
  trans_type?: string;
};

export type GhnOrderDetailData = {
  order_code: string;
  status: string;
};
