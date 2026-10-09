import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(web, 'package.json'));
function policy() {
  const compiled = require('typescript').transpileModule(
    readFileSync(resolve(web, 'src/lib/document-generation.ts'), 'utf8'),
    { compilerOptions: { target: 9, module: 1 } },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    crypto,
    TextEncoder,
    setTimeout,
    clearTimeout,
  });
  return module.exports;
}

test('logical operation key survives request loss/reopen and separates workspace, document and type', async () => {
  const { documentOperationKey } = policy();
  const first = await documentOperationKey('workspace-a', 'document-a', 'SUMMARY');
  assert.equal(first, await policy().documentOperationKey('workspace-a', 'document-a', 'SUMMARY'));
  assert.match(first, /^[A-Za-z0-9._-]{1,128}$/);
  for (const args of [
    ['workspace-b', 'document-a', 'SUMMARY'],
    ['workspace-a', 'document-b', 'SUMMARY'],
    ['workspace-a', 'document-a', 'FLASHCARD'],
  ]) {
    assert.notEqual(first, await documentOperationKey(...args));
  }
});

test('only unfinished server work is polled; failed, cancelled and uncertain operations never restart', () => {
  const { hasActiveDocumentWork, canRequestGeneration } = policy();
  const state = (status) => ({
    document: { processingStatus: 'COMPLETED', parseRetryScheduled: false },
    summaryJob: { status },
    flashcardJob: null,
  });
  for (const status of ['PENDING', 'PROCESSING', 'RETRY_WAIT'])
    assert.equal(hasActiveDocumentWork(state(status)), true);
  for (const status of ['COMPLETED', 'FAILED', 'UNCERTAIN', 'CANCELLED']) {
    assert.equal(hasActiveDocumentWork(state(status)), false);
    assert.equal(canRequestGeneration(true, { status }, false), false);
  }
  assert.equal(canRequestGeneration(true, null, false), true);
  assert.equal(canRequestGeneration(false, null, false), false);
  assert.equal(canRequestGeneration(true, null, true), false);
  assert.equal(
    hasActiveDocumentWork({
      ...state('FAILED'),
      document: { processingStatus: 'FAILED', parseRetryScheduled: true },
    }),
    true,
  );
});

function harness(read, shouldContinue = () => true) {
  const { createBoundedStatusRefresh, STATUS_REFRESH_DELAYS } = policy();
  const timers = new Map();
  const delays = [];
  const results = [];
  const errors = [];
  const stops = [];
  let id = 0;
  const stop = createBoundedStatusRefresh({
    read,
    shouldContinue,
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
    onStop: (reason) => stops.push(reason),
    schedule: (run, delay) => {
      delays.push(delay);
      timers.set(++id, run);
      return id;
    },
    cancel: (key) => timers.delete(key),
  });
  return {
    stop,
    timers,
    delays,
    results,
    errors,
    stops,
    expected: [...STATUS_REFRESH_DELAYS],
    tick: async () => {
      const [key, run] = timers.entries().next().value;
      timers.delete(key);
      await run();
    },
  };
}

test('status refresh is serial, uses bounded backoff, and stops for manual verification', async () => {
  let calls = 0;
  const h = harness(async () => ++calls);
  for (let i = 0; i < h.expected.length; i++) {
    assert.equal(h.timers.size, 1);
    await h.tick();
  }
  assert.equal(calls, h.expected.length);
  assert.deepEqual(h.delays, h.expected);
  assert.deepEqual(h.stops, ['limit']);
  assert.equal(h.timers.size, 0);
  assert.ok(h.delays.every((delay, i) => delay >= 2000 && (i === 0 || delay >= h.delays[i - 1])));
});

test('refresh stops on terminal state or read error; neither path calls a generation action', async () => {
  const terminal = harness(
    async () => ({ status: 'UNCERTAIN' }),
    () => false,
  );
  await terminal.tick();
  assert.deepEqual(terminal.stops, ['settled']);
  assert.equal(terminal.timers.size, 0);
  const failure = harness(async () => {
    throw new Error('offline');
  });
  await failure.tick();
  assert.equal(failure.errors[0].message, 'offline');
  assert.deepEqual(failure.stops, ['error']);
  assert.equal(failure.timers.size, 0);
});

test('unmount/logout discards late server results and cancels scheduled checks', async () => {
  let resolveRead;
  const h = harness(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  const pending = h.tick();
  h.stop();
  resolveRead('sensitive saved result');
  await pending;
  assert.deepEqual(h.results, []);
  assert.equal(h.timers.size, 0);
});

test('a hung server read reaches a finite deadline; its late response cannot replace a subsequent read', async () => {
  const { withRequestDeadline, STATUS_READ_DEADLINE_MS } = policy();
  let expire;
  let lateResolve;
  const stalled = withRequestDeadline(
    new Promise((resolve) => {
      lateResolve = resolve;
    }),
    STATUS_READ_DEADLINE_MS,
    {
      schedule: (run, delay) => {
        assert.equal(delay, 15000);
        expire = run;
        return 1;
      },
      cancel: () => {},
    },
  );
  const rejected = assert.rejects(stalled, /deadline/i);
  expire();
  await rejected;
  assert.equal(
    await withRequestDeadline(Promise.resolve('fresh read'), STATUS_READ_DEADLINE_MS),
    'fresh read',
  );
  lateResolve('obsolete read');
  await assert.rejects(stalled, /deadline/i);
});
