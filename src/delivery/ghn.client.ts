import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { GHN_TIMEOUT_MS } from './ghn.constants';
import {
  GhnCreateOrderData,
  GhnCreateOrderRequest,
  GhnDistrict,
  GhnEnvelope,
  GhnFeeData,
  GhnFeeRequest,
  GhnOrderDetailData,
  GhnProvince,
  GhnSwitchStatusResult,
  GhnWard,
} from './ghn.types';

/**
 * Thin transport wrapper around the GHN REST API.
 *
 * This is the only file in the delivery module permitted to call `fetch`; everything
 * above it injects and mocks this class. Follows KeycloakAdminService's shape (native
 * fetch, BadGatewayException on upstream failure) plus an explicit timeout.
 */
@Injectable()
export class GhnClient {
  private readonly logger = new Logger(GhnClient.name);

  constructor(private readonly config: AppConfigService) {}

  private async request<T>(
    path: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    const { baseUrl, token, shopId } = this.config.shippingConfig;
    const url = `${baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Token: token,
          ShopId: shopId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(GHN_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`GHN request to ${path} failed: ${message}`);
      throw new BadGatewayException(
        `Yêu cầu GHN tới ${path} thất bại: ${message}`,
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        `Yêu cầu GHN thất bại (${response.status}): ${message}`,
      );
    }

    // GHN returns HTTP 200 with code != 200 for some errors, so both gates are required.
    const envelope = (await response.json()) as GhnEnvelope<T>;
    if (envelope.code !== 200) {
      throw new BadGatewayException(
        `Yêu cầu GHN thất bại (mã ${envelope.code}): ${envelope.message}`,
      );
    }

    return envelope.data;
  }

  calculateFee(input: GhnFeeRequest): Promise<GhnFeeData> {
    return this.request<GhnFeeData>(
      '/shiip/public-api/v2/shipping-order/fee',
      input,
    );
  }

  createOrder(input: GhnCreateOrderRequest): Promise<GhnCreateOrderData> {
    return this.request<GhnCreateOrderData>(
      '/shiip/public-api/v2/shipping-order/create',
      input,
    );
  }

  getOrderDetail(orderCode: string): Promise<GhnOrderDetailData> {
    return this.request<GhnOrderDetailData>(
      '/shiip/public-api/v2/shipping-order/detail',
      { order_code: orderCode },
    );
  }

  cancelOrder(orderCode: string): Promise<GhnSwitchStatusResult[]> {
    return this.request<GhnSwitchStatusResult[]>(
      '/shiip/public-api/v2/switch-status/cancel',
      { order_codes: [orderCode] },
    );
  }

  returnOrder(orderCode: string): Promise<GhnSwitchStatusResult[]> {
    return this.request<GhnSwitchStatusResult[]>(
      '/shiip/public-api/v2/switch-status/return',
      { order_codes: [orderCode] },
    );
  }

  getProvinces(): Promise<GhnProvince[]> {
    return this.request<GhnProvince[]>(
      '/shiip/public-api/master-data/province',
      undefined,
      'GET',
    );
  }

  getDistricts(provinceId: number): Promise<GhnDistrict[]> {
    return this.request<GhnDistrict[]>(
      '/shiip/public-api/master-data/district',
      { province_id: provinceId },
    );
  }

  getWards(districtId: number): Promise<GhnWard[]> {
    return this.request<GhnWard[]>('/shiip/public-api/master-data/ward', {
      district_id: districtId,
    });
  }
}
