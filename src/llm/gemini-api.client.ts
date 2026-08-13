import { Logger, ServiceUnavailableException } from '@nestjs/common';

const GEMINI_GENERATE_CONTENT_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiContentPart =
  { text: string } | { inlineData: { mimeType: string; data: string } };

export type GeminiGenerateContentParams = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  parts: GeminiContentPart[];
  timeoutMs: number;
  logger: Logger;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

/**
 * Calls Gemini generateContent with JSON response mime type and returns the
 * concatenated text from the first candidate. Throws ServiceUnavailableException
 * on network / API / empty-content failures.
 */
export async function geminiGenerateContentJson(
  params: GeminiGenerateContentParams,
): Promise<string> {
  const { apiKey, model, systemInstruction, parts, timeoutMs, logger } = params;

  if (!apiKey.trim()) {
    throw new ServiceUnavailableException(
      'GEMINI_API_KEY chưa được cấu hình. Hãy thiết lập khi LLM_PROVIDER=gemini.',
    );
  }

  const url = `${GEMINI_GENERATE_CONTENT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown network error';
    logger.error(`Gemini request failed: ${message}`);
    throw new ServiceUnavailableException(`Gemini không khả dụng: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`Gemini returned ${response.status}: ${body.slice(0, 200)}`);
    throw new ServiceUnavailableException(
      `Yêu cầu tới Gemini thất bại với trạng thái ${response.status}`,
    );
  }

  let payload: GeminiGenerateContentResponse;
  try {
    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch {
    throw new ServiceUnavailableException(
      'Gemini trả về phản hồi không phải JSON',
    );
  }

  if (payload.error?.message) {
    throw new ServiceUnavailableException(
      `Lỗi Gemini: ${payload.error.message}`,
    );
  }

  const textParts = payload.candidates?.[0]?.content?.parts ?? [];
  const content = textParts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  if (!content) {
    throw new ServiceUnavailableException(
      'Phản hồi từ Gemini thiếu nội dung văn bản',
    );
  }

  return content;
}
