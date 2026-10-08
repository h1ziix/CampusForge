import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationLoader } from '../../../tests/fixtures/r3-source-loader.mjs';

test('actual generation processors reject malformed Redis identities before any DB or provider use', async () => {
  let calls = 0;
  const deny = () => {
    calls++;
    throw new Error('Unexpected infrastructure use');
  };
  const { load } = applicationLoader({
    '@campusforge/db': { prisma: { document: { findFirst: deny }, aIJob: { create: deny } } },
    '@campusforge/ai': { getAIProvider: deny },
  });
  const summary = load('apps/worker/src/jobs/generate-summary.ts').processSummaryJob;
  const cards = load('apps/worker/src/jobs/generate-flashcards.ts').processFlashcardJob;
  for (const operation of [summary, cards]) {
    for (const data of [
      undefined,
      null,
      {},
      { documentId: undefined, workspaceId: 'w', userId: 'u' },
      { documentId: 'd', workspaceId: '', userId: 'u' },
      { documentId: 'd', workspaceId: 'w', userId: 1 },
    ]) {
      await assert.rejects(operation(data), /Invalid document job/);
    }
  }
  assert.equal(calls, 0);
});
