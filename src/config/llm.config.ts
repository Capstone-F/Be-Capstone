export type LlmConfig = {
  /** Active LLM provider key (mock | ollama | openai | gemini). */
  provider: string;
  /** Ollama API base URL, e.g. http://localhost:11434. */
  ollamaBaseUrl: string;
  /** Ollama model tag for routine generation, e.g. gpt-oss:120b-cloud. */
  ollamaModel: string;
  /** Ollama multimodal model tag for survey face-scan, e.g. llava. */
  ollamaVisionModel: string;
  /** Request timeout for Ollama / Gemini chat calls (milliseconds). */
  ollamaTimeoutMs: number;
  /** Google AI Studio / Gemini API key (required when provider is gemini). */
  geminiApiKey: string;
  /** Gemini model id for routine generation and face-scan. */
  geminiModel: string;
};
