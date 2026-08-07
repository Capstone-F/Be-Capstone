import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import { AppConfigService } from '../config/config.service';
import { GeminiLlmRoutineProvider } from './gemini-llm-routine.provider';
import { RoutineGenerationInput } from './llm-routine.types';

describe('GeminiLlmRoutineProvider', () => {
  const input: RoutineGenerationInput = {
    customerProfile: {
      age: 28,
      gender: 'FEMALE',
      skinTypeCode: 'OSPW',
    },
    labelCodes: ['ACNE_TREATMENT'],
    products: [
      {
        productVariantId: 'v1',
        productName: 'Niacinamide Serum',
        sku: 'SKU-1',
        categoryCode: 'SERUM',
        protocolId: 'p1',
        protocolCode: 'niacinamide_general',
        protocolName: 'Niacinamide',
        timeOfUse: TimeOfUse.AM,
        instructions: 'Apply gently',
      },
    ],
  };

  const llmConfig = {
    provider: 'gemini',
    ollamaBaseUrl: 'http://host.docker.internal:11434',
    ollamaModel: 'gpt-oss:120b-cloud',
    ollamaVisionModel: 'llava',
    ollamaTimeoutMs: 120000,
    geminiApiKey: 'test-gemini-key',
    geminiModel: 'gemini-2.5-flash-lite',
  };

  const originalFetch = global.fetch;
  let provider: GeminiLlmRoutineProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      llmConfig,
    } as unknown as AppConfigService;
    provider = new GeminiLlmRoutineProvider(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns parsed routine on successful Gemini response', async () => {
    const content = JSON.stringify({
      title: 'Quy trình cá nhân hóa cho da OSPW',
      description: 'Dựa trên sản phẩm bạn đã mua từ khảo sát',
      steps: [
        {
          name: 'Niacinamide Serum',
          period: 'MORNING',
          stepOrder: 1,
          instructions:
            'Sử dụng 2-3 giọt Niacinamide Serum lên da sạch và vỗ nhẹ đến khi thấm.',
          productVariantId: 'v1',
          protocolId: 'p1',
          amountMl: null,
          waitMinutes: 5,
          dosageText: '2-3 giọt',
        },
      ],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: content }] } }],
      }),
    });

    const result = await provider.generateRoutine(input);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(fetchMock.mock.calls[0][0]).toContain('key=test-gemini-key');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      generationConfig: { responseMimeType: string };
      systemInstruction: { parts: Array<{ text: string }> };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toContain('tiếng Việt');

    expect(result.title).toContain('OSPW');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].period).toBe(RoutinePeriod.MORNING);
    expect(result.steps[0].productVariantId).toBe('v1');
    expect(result.steps[0].waitMinutes).toBe(5);
    expect(result.steps[0].dosageText).toBe('2-3 giọt');
  });

  it('throws ServiceUnavailableException when API key is missing', async () => {
    const config = {
      llmConfig: { ...llmConfig, geminiApiKey: '' },
    } as unknown as AppConfigService;
    provider = new GeminiLlmRoutineProvider(config);

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException on non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when candidates are empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws InternalServerErrorException on invalid JSON content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'not-valid-json' }] } }],
      }),
    });

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
