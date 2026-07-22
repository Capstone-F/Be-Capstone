import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TimeOfUse } from '../ingredients/enums';
import { RoutinePeriod } from '../routines/enums';
import { AppConfigService } from '../config/config.service';
import { OllamaLlmRoutineProvider } from './ollama-llm-routine.provider';
import { RoutineGenerationInput } from './llm-routine.types';

describe('OllamaLlmRoutineProvider', () => {
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
        protocolId: 'p1',
        protocolCode: 'niacinamide_general',
        protocolName: 'Niacinamide',
        timeOfUse: TimeOfUse.AM,
        instructions: 'Apply gently',
      },
    ],
  };

  const llmConfig = {
    provider: 'ollama',
    ollamaBaseUrl: 'http://host.docker.internal:11434',
    ollamaModel: 'gpt-oss:120b-cloud',
    ollamaTimeoutMs: 120000,
  };

  let provider: OllamaLlmRoutineProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      llmConfig,
    } as unknown as AppConfigService;
    provider = new OllamaLlmRoutineProvider(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns parsed routine on successful Ollama response', async () => {
    const content = JSON.stringify({
      title: 'Personalized routine for OSPW skin',
      description: 'Based on your survey purchase',
      steps: [
        {
          name: 'Niacinamide Serum',
          period: 'MORNING',
          stepOrder: 1,
          instructions: 'Apply gently',
          productVariantId: 'v1',
          protocolId: 'p1',
          amountMl: null,
          waitMinutes: 5,
          dosageText: '2 drops',
        },
      ],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content } }),
    });

    const result = await provider.generateRoutine(input);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      model: string;
      format: string;
      stream: boolean;
    };
    expect(body.model).toBe('gpt-oss:120b-cloud');
    expect(body.format).toBe('json');
    expect(body.stream).toBe(false);

    expect(result.title).toContain('OSPW');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].period).toBe(RoutinePeriod.MORNING);
    expect(result.steps[0].productVariantId).toBe('v1');
    expect(result.steps[0].waitMinutes).toBe(5);
    expect(result.steps[0].dosageText).toBe('2 drops');
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

  it('throws InternalServerErrorException on invalid JSON content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'not-valid-json' } }),
    });

    await expect(provider.generateRoutine(input)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
