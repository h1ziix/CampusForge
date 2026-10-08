/** One external request per call. The durable worker owns attempts and retry policy. */
import OpenAI from 'openai';
import type { CompletionMeta, CompletionResult } from './types';
import { estimateCostUSD, estimateInputTokenUpperBound, getModelPricing } from './pricing';
import { MAX_OUTPUT_BYTES } from './validation';

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  /** Deterministic transport injection; no paid calls are needed in tests. */
  fetch?: typeof fetch;
}

export interface CompleteJSONInput<T> {
  systemPrompt: string;
  userPrompt: string;
  parse: (raw: unknown) => T;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  /** Bounds DNS/connect/TLS and time to response headers, not just TCP connect. */
  connectionTimeoutMs?: number;
  maxInputTokens?: number;
  maxOutputBytes?: number;
  /** Must persist received usage before validation or artifact writes. */
  onResponse?: (meta: CompletionMeta) => Promise<void>;
}

export type ProviderOutcome = 'KNOWN_FAILURE' | 'RECEIVED' | 'UNKNOWN';
export type ProviderErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'UNKNOWN_MODEL'
  | 'INPUT_BUDGET_EXCEEDED'
  | 'OUTPUT_BUDGET_EXCEEDED'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_SERVER_ERROR'
  | 'PROVIDER_AUTHENTICATION'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ABORTED'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_PARTIAL_RESPONSE'
  | 'PROVIDER_EMPTY_RESPONSE'
  | 'INVALID_JSON'
  | 'INVALID_OUTPUT'
  | 'ACCOUNTING_PERSISTENCE_FAILED';

/** Safe diagnostics contain no prompt, provider body, SDK cause, or credentials. */
export class AIProviderError extends Error {
  readonly name = 'AIProviderError';

  constructor(
    readonly code: ProviderErrorCode,
    readonly outcome: ProviderOutcome,
    readonly retryable = false,
    readonly meta?: CompletionMeta,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code);
  }
}

function positiveInteger(value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new AIProviderError('INVALID_CONFIGURATION', 'KNOWN_FAILURE');
  }
  return value;
}

function aborted(signal: AbortSignal): AIProviderError {
  const reason = signal.reason;
  return new AIProviderError(
    reason === 'REQUEST_DEADLINE' || reason === 'CONNECTION_DEADLINE'
      ? 'PROVIDER_TIMEOUT'
      : 'PROVIDER_ABORTED',
    'UNKNOWN',
  );
}

/** Abort still ends our wait if a faulty transport ignores AbortSignal. */
async function raceSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw aborted(signal);
  let rejectAbort: (() => void) | undefined;
  const abort = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(aborted(signal));
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    return await Promise.race([promise, abort]);
  } finally {
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
  }
}

function safeRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}

function retryDelay(headers: Headers | undefined): number | null {
  const milliseconds = headers?.get('retry-after-ms');
  if (milliseconds && /^\d+(\.\d+)?$/.test(milliseconds)) {
    return Math.min(Math.ceil(Number(milliseconds)), Number.MAX_SAFE_INTEGER);
  }
  const value = headers?.get('retry-after');
  if (!value) return null;
  const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay >= 0 ? Math.ceil(delay) : null;
}

function transportError(error: unknown, signal: AbortSignal): AIProviderError {
  if (signal.aborted) return aborted(signal);
  if (error instanceof AIProviderError) return error;
  if (error instanceof OpenAI.APIError && error.status) {
    const status = error.status;
    if (status === 408) return new AIProviderError('PROVIDER_TIMEOUT', 'UNKNOWN');
    const quota = error.code === 'insufficient_quota';
    const retryable =
      !quota &&
      error.headers?.get('x-should-retry') !== 'false' &&
      (status === 429 || status >= 500);
    const code =
      status === 429
        ? 'PROVIDER_RATE_LIMIT'
        : status >= 500
          ? 'PROVIDER_SERVER_ERROR'
          : status === 401 || status === 403
            ? 'PROVIDER_AUTHENTICATION'
            : 'PROVIDER_REJECTED';
    return new AIProviderError(
      code,
      'KNOWN_FAILURE',
      retryable,
      undefined,
      retryDelay(error.headers),
    );
  }
  return new AIProviderError('PROVIDER_NETWORK', 'UNKNOWN');
}

function usageNumber(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

export class AIProvider {
  constructor(private readonly config: AIProviderConfig) {}

  async completeJSON<T>(input: CompleteJSONInput<T>): Promise<CompletionResult<T>> {
    const model = input.model ?? this.config.model;
    if (!getModelPricing(model)) throw new AIProviderError('UNKNOWN_MODEL', 'KNOWN_FAILURE');
    const maxTokens = positiveInteger(input.maxTokens ?? 2048, 4096);
    const maxInputTokens = positiveInteger(input.maxInputTokens ?? 64_000, 100_000);
    const maxOutputBytes = positiveInteger(
      input.maxOutputBytes ?? MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
    );
    const requestTimeoutMs = positiveInteger(input.requestTimeoutMs ?? 45_000, 120_000);
    const connectionTimeoutMs = positiveInteger(input.connectionTimeoutMs ?? 10_000, 60_000);
    if (connectionTimeoutMs > requestTimeoutMs) {
      throw new AIProviderError('INVALID_CONFIGURATION', 'KNOWN_FAILURE');
    }
    const temperature = input.temperature ?? 0.3;
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new AIProviderError('INVALID_CONFIGURATION', 'KNOWN_FAILURE');
    }
    if (estimateInputTokenUpperBound(input.systemPrompt, input.userPrompt) > maxInputTokens) {
      throw new AIProviderError('INPUT_BUDGET_EXCEEDED', 'KNOWN_FAILURE');
    }
    if (input.signal?.aborted) throw new AIProviderError('PROVIDER_ABORTED', 'KNOWN_FAILURE');

    const startedAt = Date.now();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort('REQUEST_DEADLINE'), requestTimeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, deadline.signal])
      : deadline.signal;
    const transport = this.config.fetch ?? globalThis.fetch;
    const boundedFetch: typeof fetch = async (url, init) => {
      const connection = new AbortController();
      const connectionTimer = setTimeout(
        () => connection.abort('CONNECTION_DEADLINE'),
        connectionTimeoutMs,
      );
      const connectionSignal = AbortSignal.any([
        signal,
        connection.signal,
        ...(init?.signal ? [init.signal] : []),
      ]);
      try {
        return await raceSignal(
          transport(url, { ...init, signal: connectionSignal }),
          connectionSignal,
        );
      } catch (error) {
        if (connection.signal.aborted) deadline.abort('CONNECTION_DEADLINE');
        throw error;
      } finally {
        clearTimeout(connectionTimer);
      }
    };
    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      maxRetries: 0,
      timeout: requestTimeoutMs,
      fetch: boundedFetch,
      // Never permit SDK debug logging to print document requests or provider bodies.
      logLevel: 'off',
    });

    try {
      let response;
      try {
        response = await raceSignal(
          client.chat.completions.create(
            {
              model,
              messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userPrompt },
              ],
              response_format: { type: 'json_object' },
              max_tokens: maxTokens,
              temperature,
            },
            { signal, timeout: requestTimeoutMs, maxRetries: 0 },
          ),
          signal,
        );
      } catch (error) {
        throw transportError(error, signal);
      }

      const promptTokens = usageNumber(response?.usage?.prompt_tokens);
      const completionTokens = usageNumber(response?.usage?.completion_tokens);
      const totalTokens =
        promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null;
      const actualModel =
        typeof response?.model === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(response.model)
          ? response.model
          : '';
      const price = estimateCostUSD(actualModel, promptTokens, completionTokens);
      const meta: CompletionMeta = {
        model: actualModel,
        requestedModel: model,
        promptTokens,
        completionTokens,
        totalTokens,
        usageStatus: totalTokens === null ? 'MISSING' : 'RECEIVED',
        latencyMs: Date.now() - startedAt,
        estimatedCost: price.estimatedCost,
        pricingVersion: price.pricingVersion,
        requestId: safeRequestId(response?._request_id),
      };

      // The ledger receives billable metadata even for malformed, refused, partial or invalid output.
      if (input.onResponse) {
        try {
          await raceSignal(input.onResponse(meta), signal);
        } catch {
          throw new AIProviderError('ACCOUNTING_PERSISTENCE_FAILED', 'UNKNOWN', false, meta);
        }
      }
      if (signal.aborted) throw new AIProviderError('PROVIDER_ABORTED', 'RECEIVED', false, meta);
      if (!getModelPricing(actualModel)) {
        throw new AIProviderError('UNKNOWN_MODEL', 'RECEIVED', false, meta);
      }
      if (
        (promptTokens !== null && promptTokens > maxInputTokens) ||
        (completionTokens !== null && completionTokens > maxTokens)
      ) {
        throw new AIProviderError('OUTPUT_BUDGET_EXCEEDED', 'RECEIVED', false, meta);
      }
      const choice = Array.isArray(response?.choices) ? response.choices[0] : undefined;
      if (!choice || choice.finish_reason !== 'stop') {
        throw new AIProviderError('PROVIDER_PARTIAL_RESPONSE', 'RECEIVED', false, meta);
      }
      const content = choice.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AIProviderError('PROVIDER_EMPTY_RESPONSE', 'RECEIVED', false, meta);
      }
      if (Buffer.byteLength(content, 'utf8') > maxOutputBytes) {
        throw new AIProviderError('OUTPUT_BUDGET_EXCEEDED', 'RECEIVED', false, meta);
      }
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        throw new AIProviderError('INVALID_JSON', 'RECEIVED', false, meta);
      }
      let data: T;
      try {
        data = input.parse(json);
      } catch {
        throw new AIProviderError('INVALID_OUTPUT', 'RECEIVED', false, meta);
      }
      return { data, meta };
    } finally {
      clearTimeout(timer);
    }
  }
}

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!provider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AIProviderError('INVALID_CONFIGURATION', 'KNOWN_FAILURE');
    provider = new AIProvider({ apiKey, model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' });
  }
  return provider;
}
