import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSummaryUserPrompt, parseSummaryOutput } from '../src/prompts/summary';
import { parseFlashcardOutput } from '../src/prompts/flashcard';

test('structured summary parser preserves expected output without a provider request', () => {
  const summary = {
    title: 'Synthetic title',
    tldr: 'Synthetic summary',
    sections: [{ heading: 'A', content: 'B' }],
    keyTerms: ['C'],
  };
  assert.deepEqual(parseSummaryOutput(summary), summary);
  assert.throws(
    () => parseSummaryOutput({ ...summary, sections: [{ heading: 1, content: 'B' }] }),
    /Section 0/,
  );
});

test('flashcard parser rejects malformed provider output', () => {
  assert.deepEqual(
    parseFlashcardOutput({ title: 'Synthetic', cards: [{ front: 'Q', back: 'A' }] }),
    { title: 'Synthetic', cards: [{ front: 'Q', back: 'A' }] },
  );
  assert.throws(
    () => parseFlashcardOutput({ title: 'Synthetic', cards: [{ front: 'Q', back: '' }] }),
    /Card 0/,
  );
});

test('long prompt input stays bounded during dependency upgrade', () => {
  const prompt = buildSummaryUserPrompt('x'.repeat(60_000), 'synthetic.txt');
  assert.ok(prompt.length < 49_000);
  assert.match(prompt, /was truncated/);
});
