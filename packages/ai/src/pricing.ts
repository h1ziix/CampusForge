/** Standard text prices, USD per million tokens; estimates are not provider invoices. */
export const PRICING_VERSION = 'openai-standard-text-2026-10-08-v1';
export const PRICING_SOURCES = [
  'https://developers.openai.com/api/docs/models/gpt-4o-mini',
  'https://developers.openai.com/api/docs/models/gpt-4o',
  'https://developers.openai.com/api/docs/models/gpt-4-turbo',
] as const;

interface ModelPricing {
  input: number;
  output: number;
}

// Explicit identifiers only. An arbitrary prefix or future snapshot is not known pricing.
const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4-turbo-2024-04-09': { input: 10, output: 30 },
});

export function getModelPricing(model: string): Readonly<ModelPricing> | null {
  return Object.hasOwn(MODEL_PRICING, model) ? MODEL_PRICING[model] : null;
}

export function estimateCostUSD(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): { estimatedCost: number | null; pricingVersion: string | null } {
  const price = getModelPricing(model);
  if (!price) return { estimatedCost: null, pricingVersion: null };
  if (
    promptTokens === null ||
    completionTokens === null ||
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    promptTokens < 0 ||
    completionTokens < 0
  ) {
    return { estimatedCost: null, pricingVersion: PRICING_VERSION };
  }
  // Deliberately do not assume cached-input discounts; usage is retained separately.
  return {
    estimatedCost: (promptTokens * price.input + completionTokens * price.output) / 1_000_000,
    pricingVersion: PRICING_VERSION,
  };
}

/** Byte-BPE upper bound plus chat framing margin, not an exact tokenizer or character heuristic. */
export function estimateInputTokenUpperBound(systemPrompt: string, userPrompt: string): number {
  return Buffer.byteLength(systemPrompt, 'utf8') + Buffer.byteLength(userPrompt, 'utf8') + 128;
}

/** Reserve worst-case input/output for every allowed external attempt, rounded up to USD micros. */
export function estimateReservationMicros(
  model: string,
  maxInputTokens: number,
  maxOutputTokens: number,
  maxAttempts: number,
): number | null {
  if (
    ![maxInputTokens, maxOutputTokens, maxAttempts].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  ) {
    return null;
  }
  const { estimatedCost } = estimateCostUSD(model, maxInputTokens, maxOutputTokens);
  if (estimatedCost === null) return null;
  const reservation = Math.ceil(estimatedCost * 1_000_000 * maxAttempts);
  return Number.isSafeInteger(reservation) ? reservation : null;
}
