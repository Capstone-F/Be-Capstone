import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { OllamaSkinVisionProvider } from './ollama-skin-vision.provider';
import { SkinVisionAnalyzeInput } from './skin-vision.types';

describe('OllamaSkinVisionProvider', () => {
  const llmConfig = {
    provider: 'ollama',
    ollamaBaseUrl: 'http://host.docker.internal:11434',
    ollamaModel: 'gpt-oss:120b-cloud',
    ollamaVisionModel: 'mistral-large-3:675b-cloud',
    ollamaTimeoutMs: 120000,
  };

  const input: SkinVisionAnalyzeInput = {
    imageUrl: 'https://cdn.example.com/face.jpg',
    imageBase64: 'dGVzdA==',
    mimeType: 'image/jpeg',
  };

  const originalFetch = global.fetch;
  let provider: OllamaSkinVisionProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = { llmConfig } as unknown as AppConfigService;
    provider = new OllamaSkinVisionProvider(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns parsed findings on successful Ollama response', async () => {
    const content = JSON.stringify({
      labels: [
        {
          code: 'ACNE',
          explanation: 'Có nhiều nốt viêm đỏ dọc vùng chữ T.',
        },
      ],
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content } }),
    });

    const result = await provider.analyze(input);

    expect(result.findings).toEqual([
      {
        labelCode: 'ACNE',
        explanation: 'Có nhiều nốt viêm đỏ dọc vùng chữ T.',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"mistral-large-3:675b-cloud"'),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('tiếng Việt');
    expect(body.messages[1].content).toContain('tiếng Việt');
    expect(body.messages[1].images).toEqual(['dGVzdA==']);
  });

  it('throws ServiceUnavailableException when Ollama is down', async () => {
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
});
