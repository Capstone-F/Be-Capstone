import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { GeminiSkinVisionProvider } from './gemini-skin-vision.provider';
import { SkinVisionAnalyzeInput } from './skin-vision.types';

describe('GeminiSkinVisionProvider', () => {
  const llmConfig = {
    provider: 'gemini',
    ollamaBaseUrl: 'http://host.docker.internal:11434',
    ollamaModel: 'gpt-oss:120b-cloud',
    ollamaVisionModel: 'llava',
    ollamaTimeoutMs: 120000,
    geminiApiKey: 'test-gemini-key',
    geminiModel: 'gemini-2.5-flash-lite',
  };

  const input: SkinVisionAnalyzeInput = {
    imageUrl: 'https://cdn.example.com/face.jpg',
    imageBase64: 'dGVzdA==',
    mimeType: 'image/jpeg',
  };

  const originalFetch = global.fetch;
  let provider: GeminiSkinVisionProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = { llmConfig } as unknown as AppConfigService;
    provider = new GeminiSkinVisionProvider(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns parsed findings on successful Gemini response', async () => {
    const content = JSON.stringify({
      labels: [
        {
          code: 'ACNE',
          explanation: 'Visible inflammatory spots on the T-zone.',
        },
      ],
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: content }] } }],
      }),
    });

    const result = await provider.analyze(input);

    expect(result.findings).toEqual([
      {
        labelCode: 'ACNE',
        explanation: 'Visible inflammatory spots on the T-zone.',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'gemini-2.5-flash-lite:generateContent?key=test-gemini-key',
      ),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      contents: Array<{
        parts: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      }>;
      generationConfig: { responseMimeType: string };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.any(String) }),
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'dGVzdA==',
          },
        },
      ]),
    );
  });

  it('throws ServiceUnavailableException when API key is missing', async () => {
    const config = {
      llmConfig: { ...llmConfig, geminiApiKey: '' },
    } as unknown as AppConfigService;
    provider = new GeminiSkinVisionProvider(config);

    await expect(provider.analyze(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when Gemini is down', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(provider.analyze(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws when imageBase64 is missing', async () => {
    await expect(
      provider.analyze({ ...input, imageBase64: '' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException on unusable model output', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{' }] } }],
      }),
    });

    await expect(provider.analyze(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
