/**
 * @campusforge/ai — OpenAI provider abstraction.
 *
 * Wraps the OpenAI SDK with:
 * - Structured JSON output via response_format
 * - Automatic latency tracking
 * - Token usage and cost estimation
 * - Single configuration point for model/API key
 *
 * This is NOT a generic LLM framework. It wraps exactly the capabilities
 * CampusForge needs today (chat completions with JSON mode) and is
 * structured so additional features (streaming, embeddings) can be
 * added without breaking existing callers.
 */
import OpenAI from 'openai';
import type { CompletionMeta, CompletionResult } from './types';

// ─── Configuration ──────────────────────────────────────────

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  /** Optional base URL for testing with local LLMs or proxies. */
  baseURL?: string;
}

/** Cost per 1M tokens for supported models (input, output). */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output
  );
}

// ─── Provider ───────────────────────────────────────────────

export class AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
  }

  /**
   * Send a chat completion request and parse JSON output.
   *
   * @param systemPrompt - The system instruction.
   * @param userPrompt   - The user message (document text, etc.).
   * @param parse        - A function to validate/parse the raw JSON into T.
   *                       Throw if the shape is wrong — the error propagates.
   * @returns CompletionResult<T> with parsed data and metadata.
   */
  async completeJSON<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    parse: (raw: unknown) => T;
    /** Override the default model for this call. */
    model?: string;
    /** Max tokens for the response. */
    maxTokens?: number;
    /** Temperature (0–2). Default 0.3 for deterministic summaries. */
    temperature?: number;
  }): Promise<CompletionResult<T>> {
    const model = input.model ?? this.model;
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.3,
    });

    const latencyMs = Date.now() - start;
    const choice = response.choices[0];

    if (!choice?.message?.content) {
      throw new Error('Empty response from AI provider');
    }

    // Parse JSON from response
    let rawJSON: unknown;
    try {
      rawJSON = JSON.parse(choice.message.content);
    } catch {
      throw new Error(`AI provider returned invalid JSON: ${choice.message.content.slice(0, 200)}`);
    }

    // Validate shape with caller-provided parser
    const data = input.parse(rawJSON);

    // Build metadata
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;

    const meta: CompletionMeta = {
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      latencyMs,
      estimatedCost: estimateCost(model, promptTokens, completionTokens),
    };

    return { data, meta };
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _provider: AIProvider | null = null;

/**
 * Get the shared AIProvider instance.
 * Reads OPENAI_API_KEY and OPENAI_MODEL from environment.
 * Call this in server-side code only (worker, server actions).
 */
export function getAIProvider(): AIProvider {
  if (!_provider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
    }
    _provider = new AIProvider({
      apiKey,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    });
  }
  return _provider;
}
