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

test('prompt preserves complete input and relies on explicit token admission', () => {
  const prompt = buildSummaryUserPrompt('x'.repeat(60_000), 'synthetic.txt');
  assert.ok(prompt.includes('x'.repeat(60_000)));
  assert.doesNotMatch(prompt, /was truncated/);
});

test('summary validation trims strings, rejects empty sections and unsupported fields', () => {
  const valid = {
    title: ' Title ',
    tldr: ' Summary ',
    sections: [{ heading: ' Heading ', content: ' Content ' }],
    keyTerms: [' Term '],
  };
  assert.deepEqual(parseSummaryOutput(valid), {
    title: 'Title',
    tldr: 'Summary',
    sections: [{ heading: 'Heading', content: 'Content' }],
    keyTerms: ['Term'],
  });
  for (const invalid of [
    { ...valid, title: ' \n ' },
    { ...valid, tldr: '' },
    { ...valid, sections: [] },
    { ...valid, sections: [{ heading: 'A', content: '   ' }] },
    { ...valid, sections: Array.from({ length: 7 }, () => valid.sections[0]) },
    { ...valid, keyTerms: [] },
    { ...valid, keyTerms: [' '] },
    { ...valid, keyTerms: Array.from({ length: 11 }, () => 'Term') },
    { ...valid, title: 'x'.repeat(241) },
    { ...valid, sections: [{ heading: 'A', content: 'x'.repeat(8001) }] },
    { ...valid, extra: 'Unsupported' },
    { ...valid, sections: [{ heading: 'A', content: 'B', extra: true }] },
    [],
    null,
  ])
    assert.throws(() => parseSummaryOutput(invalid));
});

test('flashcard validation bounds collection, fields and aggregate persisted bytes', () => {
  const valid = { title: ' Title ', cards: [{ front: ' Q ', back: ' A ' }] };
  assert.deepEqual(parseFlashcardOutput(valid), {
    title: 'Title',
    cards: [{ front: 'Q', back: 'A' }],
  });
  for (const invalid of [
    { ...valid, title: ' ' },
    { ...valid, cards: [] },
    { ...valid, cards: Array.from({ length: 31 }, () => valid.cards[0]) },
    { ...valid, cards: [{ front: ' ', back: 'A' }] },
    { ...valid, cards: [{ front: 'Q', back: ' ' }] },
    { ...valid, cards: [{ front: 'x'.repeat(2001), back: 'A' }] },
    { ...valid, cards: [{ front: 'Q', back: 'x'.repeat(4001) }] },
    { ...valid, cards: [{ front: 'Q', back: 'A', extra: true }] },
    { ...valid, extra: true },
    {
      ...valid,
      cards: Array.from({ length: 30 }, () => ({
        front: 'Я'.repeat(1500),
        back: 'Я'.repeat(3000),
      })),
    },
    [],
    null,
  ])
    assert.throws(() => parseFlashcardOutput(invalid));
});
