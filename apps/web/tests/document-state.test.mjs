import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationLoader } from '../../../tests/fixtures/r3-source-loader.mjs';

const results = applicationLoader().load('packages/shared/src/types/action-result.ts');
const aiLoader = applicationLoader();
const ai = {
  ...aiLoader.load('packages/ai/src/pricing.ts'),
  ...aiLoader.load('packages/ai/src/prompts/summary.ts'),
  ...aiLoader.load('packages/ai/src/prompts/flashcard.ts'),
};
const timestamp = new Date('2026-10-08T10:00:00.000Z');
const source = (overrides = {}) => ({
  id: 'document-a',
  filename: 'lecture.txt',
  mimeType: 'text/plain',
  sizeBytes: 32,
  parsedText: 'Mitochondria produce ATP through respiration.',
  storageKey: 'private/object-key',
  processingStatus: 'COMPLETED',
  summaryJson: null,
  parseError: null,
  parseAttempts: 1,
  parseNextAttemptAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

function queryFixture(document = source(), environment = {}) {
  const shared = applicationLoader({}, environment).load('packages/shared/src/env.ts');
  const calls = [];
  const prisma = {
    document: {
      findFirst: async (query) => {
        calls.push(query);
        return document;
      },
      findMany: async (query) => {
        calls.push(query);
        return query.select && Object.keys(query.select).length === 1
          ? [{ id: document.id }]
          : [document];
      },
    },
  };
  const { load } = applicationLoader(
    {
      '@campusforge/db': { prisma, PARSE_MAX_ATTEMPTS: 5, Prisma: { DbNull: 'DB_NULL' } },
      '@campusforge/shared': shared,
      '@campusforge/ai': ai,
    },
    environment,
  );
  return { queries: load('apps/web/src/server/queries/document.ts'), calls };
}

test('document detail contains accurate prompt-inclusive eligibility without source or storage internals', async () => {
  const f = queryFixture();
  const row = await f.queries.getDocumentById('document-a', 'workspace-a');
  assert.equal('parsedText' in row, false);
  assert.equal('storageKey' in row, false);
  assert.equal(row.aiInput.textBytes, Buffer.byteLength(source().parsedText));
  assert.equal(row.aiInput.maxInputTokens, 16_000);
  assert.equal(
    row.aiInput.summary.estimatedInputTokens,
    ai.estimateInputTokenUpperBound(
      ai.SUMMARY_SYSTEM_PROMPT,
      ai.buildSummaryUserPrompt(source().parsedText, source().filename),
    ),
  );
  assert.equal(row.aiInput.summary.eligible, true);
  assert.equal(row.aiInput.flashcards.eligible, true);
  assert.equal(f.calls[0].where.workspaceId, 'workspace-a');
  assert.equal(f.calls[0].where.lifecycle, 'ACTIVE');
  assert.equal(f.calls[0].select.storageKey, undefined);
});

test('exact AI input boundary agrees with admission and never offers silently shortened input', async () => {
  const text = 'Дыхание производит АТФ. '.repeat(100);
  const doc = source({ parsedText: text });
  const exact = ai.estimateInputTokenUpperBound(
    ai.SUMMARY_SYSTEM_PROMPT,
    ai.buildSummaryUserPrompt(text, doc.filename),
  );
  for (const [budget, eligible] of [
    [exact, true],
    [exact - 1, false],
  ]) {
    const { queries } = queryFixture(doc, { AI_MAX_INPUT_TOKENS: String(budget) });
    const row = await queries.getDocumentById(doc.id, 'workspace-a');
    assert.equal(row.aiInput.summary.estimatedInputTokens, exact);
    assert.equal(row.aiInput.summary.eligible, eligible);
    if (!eligible) assert.match(row.aiInput.summary.reason, /exceeds|budget/i);
    assert.equal(row.aiInput.textBytes, Buffer.byteLength(text));
  }
});

test('empty, pending and failed parsing are ineligible and expose safe factual retry state', async () => {
  for (const overrides of [
    { parsedText: ' \n ' },
    { processingStatus: 'PENDING', parsedText: null, parseAttempts: 0 },
    {
      processingStatus: 'FAILED',
      parsedText: null,
      parseAttempts: 2,
      parseError: 'private parser input',
    },
    { processingStatus: 'FAILED', parsedText: null, parseAttempts: 5 },
  ]) {
    const { queries } = queryFixture(source(overrides));
    const row = await queries.getDocumentById('document-a', 'workspace-a');
    assert.equal(row.aiInput.summary.eligible, false);
    assert.equal(row.aiInput.flashcards.eligible, false);
    assert.equal(row.parseMaxAttempts, 5);
    assert.equal(
      row.parseRetryScheduled,
      overrides.processingStatus === 'FAILED' && overrides.parseAttempts < 5,
    );
    assert.equal(JSON.stringify(row).includes('private parser input'), false);
  }
});

test('document lists select only metadata and bounded IDs for saved-summary presence', async () => {
  const f = queryFixture();
  for (const read of [
    () => f.queries.getWorkspaceDocuments('workspace-a'),
    () => f.queries.getRecentDocuments('workspace-a', 5),
  ]) {
    f.calls.length = 0;
    const rows = await read();
    assert.equal(rows[0].hasSummary, true);
    for (const query of f.calls) {
      assert.equal(query.where.workspaceId, 'workspace-a');
      assert.equal(query.where.lifecycle, 'ACTIVE');
      assert.ok(query.select);
      for (const field of ['parsedText', 'storageKey', 'summaryJson'])
        assert.equal(query.select[field], undefined);
    }
    assert.deepEqual(Array.from(f.calls[1].where.id.in), ['document-a']);
  }
});

test('latest AI receipt is workspace-scoped, includes durable retry identity and sanitizes stored errors', async () => {
  let captured;
  const job = {
    id: 'operation-a',
    type: 'SUMMARY',
    status: 'UNCERTAIN',
    idempotencyKey: 'retry-same-key',
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: timestamp,
    finishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenUsage: null,
    estimatedCost: null,
    latencyMs: null,
    errorMessage: 'private-provider-body-and-api-key',
    inputJson: { text: 'private input' },
  };
  const { load } = applicationLoader({
    '@campusforge/db': {
      prisma: {
        aIJob: {
          findFirst: async (query) => {
            captured = query;
            return job;
          },
        },
      },
    },
  });
  const queries = load('apps/web/src/server/queries/summary.ts');
  const row = await queries.getLatestAIJob('document-a', 'SUMMARY', 'workspace-a');
  assert.equal(captured.where.workspaceId, 'workspace-a');
  assert.equal(captured.where.document.is.workspaceId, 'workspace-a');
  assert.equal(row.idempotencyKey, 'retry-same-key');
  assert.equal(row.status, 'UNCERTAIN');
  assert.match(row.errorMessage, /unknown|uncertain|unconfirmed/i);
  assert.equal(JSON.stringify(row).includes('private'), false);
  assert.equal(captured.select.inputJson, undefined);
  assert.equal(captured.select.outputJson, undefined);
});

test('document state action authenticates and checks membership before reading saved results', async () => {
  const calls = [];
  const state = { member: true };
  const { load } = applicationLoader({
    '@campusforge/shared': results,
    '@/server/services/auth-helpers': {
      requireAuth: async () => {
        calls.push('auth');
        return { id: 'user-a' };
      },
      requireWorkspaceMember: async (...args) => {
        calls.push(['member', ...args]);
        if (!state.member) throw new Error('FORBIDDEN');
      },
    },
    '@/server/services/document': {},
    '@/server/queries/document-state': {
      getDocumentGenerationState: async (...args) => {
        calls.push(['read', ...args]);
        return { document: { id: 'document-a' } };
      },
    },
  });
  const actions = load('apps/web/src/server/actions/document.ts');
  const form = new FormData();
  form.set('documentId', 'document-a');
  form.set('workspaceId', 'workspace-a');
  assert.equal((await actions.getDocumentGenerationStateAction(form)).success, true);
  assert.deepEqual(calls, [
    'auth',
    ['member', 'user-a', 'workspace-a'],
    ['read', 'document-a', 'workspace-a'],
  ]);
  calls.length = 0;
  state.member = false;
  await assert.rejects(actions.getDocumentGenerationStateAction(form), /FORBIDDEN/);
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === 'read'),
    false,
  );
});

test('completed receipts are read before artifacts so a worker commit cannot hide a saved result and stop polling', async () => {
  let workerCommitted = false;
  const savedSummary = {
    title: 'Respiration',
    tldr: 'Mitochondria produce ATP.',
    sections: [],
    keyTerms: ['ATP'],
  };
  const savedSet = { id: 'set-a', title: 'Respiration cards', cardCount: 1 };
  const { load } = applicationLoader({
    '@/server/queries/document': {
      getDocumentById: async () => ({
        id: 'document-a',
        processingStatus: 'COMPLETED',
        parseRetryScheduled: false,
        hasSummary: false,
      }),
    },
    '@/server/queries/summary': {
      getLatestAIJob: async (_, type) => {
        // The atomic worker transaction commits after metadata was read. A
        // result SELECT issued earlier would have returned its old snapshot.
        workerCommitted = true;
        return { id: `job-${type}`, status: 'COMPLETED' };
      },
      getDocumentSummary: async () => (workerCommitted ? savedSummary : null),
    },
    '@/server/queries/flashcard': {
      getFlashcardSetsForDocument: async () => (workerCommitted ? [savedSet] : []),
    },
  });
  const state = await load(
    'apps/web/src/server/queries/document-state.ts',
  ).getDocumentGenerationState('document-a', 'workspace-a');
  assert.equal(state.summaryJob.status, 'COMPLETED');
  assert.equal(state.flashcardJob.status, 'COMPLETED');
  assert.equal(state.summary, savedSummary);
  assert.equal(state.flashcardSets[0], savedSet);
  assert.equal(state.document.hasSummary, true);
});
