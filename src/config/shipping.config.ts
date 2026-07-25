export type ShippingConfig = {
  /** GHN API token (maps to the `Token` header). */
  token: string;
  /** GHN shop id (maps to the `ShopId` header). */
  shopId: string;
  /** GHN gateway host, e.g. https://dev-online-gateway.ghn.vn. */
  baseUrl: string;
  /** Pickup district id of the warehouse registered on the GHN shop. 0 when unconfigured. */
  fromDistrictId: number;
  /** Pickup ward code of the warehouse registered on the GHN shop. */
  fromWardCode: string;
  /**
   * Shared secret embedded in the webhook URL path. GHN does not sign its callbacks,
   * so this is the only authentication gate on the webhook.
   */
  webhookSecret: string;
};
