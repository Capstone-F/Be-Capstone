import { BadGatewayException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { GhnClient } from './ghn.client';
import { GhnFeeRequest } from './ghn.types';

const SHIPPING_CONFIG = {
  token: 'TOK',
  shopId: '885',
  baseUrl: 'https://ghn.test',
  fromDistrictId: 1442,
  fromWardCode: '21012',
  webhookSecret: 'shh',
};

const makeConfig = () =>
  ({ shippingConfig: SHIPPING_CONFIG }) as unknown as AppConfigService;

const FEE_REQUEST: GhnFeeRequest = {
  to_district_id: 1442,
  to_ward_code: '21012',
  weight: 400,
};

const mockFetch = (value: Partial<Response>) =>
  jest.spyOn(global, 'fetch').mockResolvedValue(value as Response);

describe('GhnClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends Token and ShopId headers and unwraps the envelope data', async () => {
    const fetchSpy = mockFetch({
      ok: true,
      json: async () => ({
        code: 200,
        message: 'Success',
        data: { total: 32000 },
      }),
    });

    const fee = await new GhnClient(makeConfig()).calculateFee(FEE_REQUEST);

    expect(fee.total).toBe(32000);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://ghn.test/shiip/public-api/v2/shipping-order/fee');
    const headers = init!.headers as Record<string, string>;
    expect(headers.Token).toBe('TOK');
    expect(headers.ShopId).toBe('885');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual(FEE_REQUEST);
  });

  it('throws BadGatewayException on a non-ok HTTP response', async () => {
    mockFetch({
      ok: false,
      status: 400,
      text: async () => 'Sai thong tin Required Note',
    });

    await expect(
      new GhnClient(makeConfig()).calculateFee(FEE_REQUEST),
    ).rejects.toThrow(BadGatewayException);
  });

  it('throws when GHN returns a non-200 code inside a 200 envelope', async () => {
    // GHN answers HTTP 200 with code: 400 for some errors, so response.ok alone
    // is not a success check.
    mockFetch({
      ok: true,
      json: async () => ({ code: 400, message: 'Invalid ward', data: null }),
    });

    await expect(
      new GhnClient(makeConfig()).calculateFee(FEE_REQUEST),
    ).rejects.toThrow(/mã 400.*Invalid ward/);
  });

  it('wraps network/timeout failures in BadGatewayException', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timed out'));

    await expect(
      new GhnClient(makeConfig()).calculateFee(FEE_REQUEST),
    ).rejects.toThrow(BadGatewayException);
  });

  it('gets provinces over GET without a body', async () => {
    const fetchSpy = mockFetch({
      ok: true,
      json: async () => ({
        code: 200,
        message: 'Success',
        data: [{ ProvinceID: 202, ProvinceName: 'Ho Chi Minh' }],
      }),
    });

    const provinces = await new GhnClient(makeConfig()).getProvinces();

    expect(provinces).toHaveLength(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://ghn.test/shiip/public-api/master-data/province');
    expect(init!.method).toBe('GET');
    expect(init!.body).toBeUndefined();
  });

  it('posts province_id when listing districts', async () => {
    const fetchSpy = mockFetch({
      ok: true,
      json: async () => ({ code: 200, message: 'Success', data: [] }),
    });

    await new GhnClient(makeConfig()).getDistricts(202);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({ province_id: 202 });
  });
});
