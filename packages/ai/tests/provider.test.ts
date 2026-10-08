import assert from 'node:assert/strict';
import test from 'node:test';
import { AIProvider, AIProviderError } from '../src/provider';
import { parseSummaryOutput } from '../src/prompts/summary';
import {
  estimateCostUSD,
  estimateInputTokenUpperBound,
  estimateReservationMicros,
} from '../src/pricing';
import type { CompletionMeta } from '../src/types';

const summary = {
  title: 'Synthetic',
  tldr: 'A substantive summary.',
  sections: [{ heading: 'A', content: 'A substantive section.' }],
  keyTerms: ['Term'],
};
const completionInput = {
  systemPrompt: 'Return JSON.',
  userPrompt: 'Synthetic source.',
  parse: parseSummaryOutput,
};

function response(content = JSON.stringify(summary), overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: 'synthetic-completion',
      model: 'gpt-4o-mini-2024-07-18',
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
      ...overrides,
    }),
    { headers: { 'content-type': 'application/json', 'x-request-id': 'req_synthetic' } },
  );
}

function provider(fetch: typeof globalThis.fetch) {
  return new AIProvider({ apiKey: 'synthetic-not-a-real-key', model: 'gpt-4o-mini', fetch });
}

test('one SDK request records actual model and usage before parsing', async () => {
  const order: string[] = [];
  let requestBody: Record<string, unknown> = {};
  const result = await provider(async (_url, init) => {
    order.push('transport');
    requestBody = JSON.parse(String(init?.body));
    return response();
  }).completeJSON({
    ...completionInput,
    maxTokens: 1234,
    onResponse: async (meta) => {
      assert.equal(meta.totalTokens, 50);
      assert.equal(meta.model, 'gpt-4o-mini-2024-07-18');
      assert.equal(meta.requestedModel, 'gpt-4o-mini');
      assert.equal(meta.requestId, 'req_synthetic');
      order.push('ledger');
    },
    parse: (raw) => {
      order.push('validation');
      return parseSummaryOutput(raw);
    },
  });
  assert.deepEqual(order, ['transport', 'ledger', 'validation']);
  assert.equal(requestBody.max_tokens, 1234);
  assert.equal(result.meta.usageStatus, 'RECEIVED');
  assert.ok(result.meta.estimatedCost && result.meta.estimatedCost > 0);
  assert.deepEqual(result.data, summary);
});

for (const status of [429, 500, 502, 401, 403, 400, 408]) {
  test(`HTTP ${status} makes exactly one transport call with explicit retry classification`, async () => {
    let calls = 0;
    const ai = provider(async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: 'private provider body' } }), {
        status,
        headers: { 'content-type': 'application/json', 'retry-after': '2' },
      });
    });
    await assert.rejects(ai.completeJSON(completionInput), (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.retryable, status === 429 || status >= 500);
      assert.equal(error.outcome, status === 408 ? 'UNKNOWN' : 'KNOWN_FAILURE');
      assert.doesNotMatch(error.message, /private provider body/);
      if (error.retryable) assert.equal(error.retryAfterMs, 2000);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('quota rejection is terminal despite HTTP 429', async () => {
  await assert.rejects(
    provider(
      async () =>
        new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    ).completeJSON(completionInput),
    (error: unknown) => error instanceof AIProviderError && !error.retryable,
  );
});

test('provider retry suppression is respected and pre-cancelled work makes no call', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: 'Synthetic rejection' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
    });
  });
  await assert.rejects(
    ai.completeJSON(completionInput),
    (error: unknown) => error instanceof AIProviderError && !error.retryable,
  );
  const cancel = new AbortController();
  cancel.abort();
  await assert.rejects(
    ai.completeJSON({ ...completionInput, signal: cancel.signal }),
    (error: unknown) => error instanceof AIProviderError && error.outcome === 'KNOWN_FAILURE',
  );
  assert.equal(calls, 1);
});

test('invalid hard caps reject before transport', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return response();
  });
  for (const limits of [
    { maxInputTokens: 100_001 },
    { maxTokens: 4097 },
    { maxOutputBytes: 65_537 },
    { requestTimeoutMs: 120_001 },
    { connectionTimeoutMs: 60_001 },
    { connectionTimeoutMs: 200, requestTimeoutMs: 100 },
    { temperature: Number.NaN },
  ])
    await assert.rejects(
      ai.completeJSON({ ...completionInput, ...limits }),
      /INVALID_CONFIGURATION/,
    );
  assert.equal(calls, 0);
});

for (const [name, content, overrides, code] of [
  ['malformed', '{private-document', {}, 'INVALID_JSON'],
  ['schema', JSON.stringify({ ...summary, title: '   ' }), {}, 'INVALID_OUTPUT'],
  ['empty', ' \n ', {}, 'PROVIDER_EMPTY_RESPONSE'],
  ['oversized', 'x'.repeat(65_537), {}, 'OUTPUT_BUDGET_EXCEEDED'],
  [
    'partial',
    JSON.stringify(summary),
    { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(summary) } }] },
    'PROVIDER_PARTIAL_RESPONSE',
  ],
] as const) {
  test(`${name} output retains received accounting and fails safely`, async () => {
    const ledger: CompletionMeta[] = [];
    await assert.rejects(
      provider(async () => response(content, overrides)).completeJSON({
        ...completionInput,
        onResponse: async (meta) => {
          ledger.push(meta);
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof AIProviderError);
        assert.equal(error.code, code);
        assert.equal(error.outcome, 'RECEIVED');
        assert.equal(error.meta?.totalTokens, 50);
        assert.equal(error.retryable, false);
        assert.doesNotMatch(error.message, /private-document/);
        return true;
      },
    );
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].usageStatus, 'RECEIVED');
  });
}

test('accounting persistence failure prevents validation and is explicitly uncertain', async () => {
  let validated = false;
  await assert.rejects(
    provider(async () => response()).completeJSON({
      ...completionInput,
      onResponse: async () => {
        throw new Error('private database failure');
      },
      parse: () => {
        validated = true;
        return summary;
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AIProviderError);
      assert.equal(error.code, 'ACCOUNTING_PERSISTENCE_FAILED');
      assert.equal(error.outcome, 'UNKNOWN');
      assert.equal(error.meta?.totalTokens, 50);
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /private database failure/);
      return true;
    },
  );
  assert.equal(validated, false);
});

test('missing or partial usage never becomes a zero-price response', async () => {
  for (const usage of [
    undefined,
    { prompt_tokens: 20 },
    { prompt_tokens: -1, completion_tokens: 30 },
  ]) {
    const result = await provider(async () => response(undefined, { usage })).completeJSON(
      completionInput,
    );
    assert.equal(result.meta.usageStatus, 'MISSING');
    assert.equal(result.meta.estimatedCost, null);
    assert.equal(result.meta.totalTokens, null);
    assert.ok(result.meta.pricingVersion);
  }
});

test('unknown actual model retains usage with nullable price then fails closed', async () => {
  let ledger: CompletionMeta | undefined;
  await assert.rejects(
    provider(async () => response(undefined, { model: 'unpriced-provider-model' })).completeJSON({
      ...completionInput,
      onResponse: async (meta) => {
        ledger = meta;
      },
    }),
    (error: unknown) => error instanceof AIProviderError && error.code === 'UNKNOWN_MODEL',
  );
  assert.equal(ledger?.model, 'unpriced-provider-model');
  assert.equal(ledger?.totalTokens, 50);
  assert.equal(ledger?.estimatedCost, null);
  assert.equal(ledger?.pricingVersion, null);
});

test('unknown requested model and oversized token upper bound are rejected before transport', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return response();
  });
  await assert.rejects(
    ai.completeJSON({ ...completionInput, model: 'unpriced-model' }),
    /UNKNOWN_MODEL/,
  );
  await assert.rejects(
    ai.completeJSON({ ...completionInput, userPrompt: 'Я'.repeat(1000), maxInputTokens: 1500 }),
    /INPUT_BUDGET_EXCEEDED/,
  );
  assert.equal(calls, 0);
});

test('connection/header deadline bounds a transport that ignores abort', async () => {
  let calls = 0;
  const startedAt = Date.now();
  await assert.rejects(
    provider(async () => {
      calls++;
      return new Promise<Response>(() => {});
    }).completeJSON({ ...completionInput, connectionTimeoutMs: 15, requestTimeoutMs: 100 }),
    (error: unknown) =>
      error instanceof AIProviderError &&
      error.code === 'PROVIDER_TIMEOUT' &&
      error.outcome === 'UNKNOWN',
  );
  assert.equal(calls, 1);
  assert.ok(Date.now() - startedAt < 1000);
});

test('request deadline bounds a response body that never finishes', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    provider(async () => new Response(new ReadableStream())).completeJSON({
      ...completionInput,
      connectionTimeoutMs: 15,
      requestTimeoutMs: 35,
    }),
    (error: unknown) => error instanceof AIProviderError && error.code === 'PROVIDER_TIMEOUT',
  );
  assert.ok(Date.now() - startedAt < 1000);
});

test('abort during a request and network errors remain uncertain and never retry', async () => {
  for (const kind of ['abort', 'network']) {
    let calls = 0;
    const controller = new AbortController();
    await assert.rejects(
      provider(async () => {
        calls++;
        if (kind === 'abort') {
          controller.abort();
          return new Promise<Response>(() => {});
        }
        throw new Error('private transport failure');
      }).completeJSON({ ...completionInput, signal: controller.signal }),
      (error: unknown) => {
        assert.ok(error instanceof AIProviderError);
        assert.equal(error.outcome, 'UNKNOWN');
        assert.equal(error.retryable, false);
        assert.doesNotMatch(error.message, /private transport failure/);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test('known prices and reservations are versioned; unsupported models and usage stay null', () => {
  assert.deepEqual(
    estimateCostUSD('gpt-4o-mini-2024-07-18', 1_000_000, 1_000_000).estimatedCost,
    0.75,
  );
  assert.equal(estimateCostUSD('gpt-4o', 1_000_000, 1_000_000).estimatedCost, 12.5);
  assert.equal(estimateCostUSD('gpt-4-turbo', 1_000_000, 1_000_000).estimatedCost, 40);
  assert.equal(estimateCostUSD('gpt-4o-future', 1, 1).estimatedCost, null);
  assert.equal(estimateCostUSD('gpt-4o', null, 1).estimatedCost, null);
  assert.equal(estimateReservationMicros('gpt-4o-mini', 64_000, 4096, 3), 36_173);
  assert.equal(estimateReservationMicros('unknown', 64_000, 4096, 3), null);
  assert.equal(estimateInputTokenUpperBound('A', 'Я😀'), 135);
});
