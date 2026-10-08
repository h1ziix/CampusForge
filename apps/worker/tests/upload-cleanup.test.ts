import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { applicationLoader } from '../../../tests/fixtures/r3-source-loader.mjs';

const key = 'documents/synthetic-workspace/aa96fce5-55d6-44e2-a414-f4cae0c43e2d';
const uploadId = 'aa96fce5-55d6-44e2-a414-f4cae0c43e2d';

function fixture() {
  type Input = { Key: string; Bucket: string };
  const state = {
    metadata: {} as Record<string, string>,
    headStatus: 0,
    deleteStatus: 0,
    commands: [] as { kind: string; input: Input; signal: AbortSignal }[],
    deadlines: [] as number[],
  };
  class Command {
    input: Input;
    constructor(input: Input) {
      this.input = input;
    }
  }
  class HeadObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class S3Client {
    async send(command: Command, options: { abortSignal: AbortSignal }) {
      state.commands.push({
        kind: command.constructor.name,
        input: command.input,
        signal: options.abortSignal,
      });
      const status = command instanceof HeadObjectCommand ? state.headStatus : state.deleteStatus;
      if (status) {
        throw Object.assign(new Error('Synthetic object storage failure'), {
          $metadata: { httpStatusCode: status },
        });
      }
      return { Metadata: state.metadata };
    }
  }
  const { load } = applicationLoader(
    {
      '@aws-sdk/client-s3': {
        S3Client,
        HeadObjectCommand,
        GetObjectCommand,
        DeleteObjectCommand,
      },
    },
    { S3_BUCKET: 'r3-synthetic-only' },
    {
      AbortSignal: {
        timeout(ms: number) {
          state.deadlines.push(ms);
          return AbortSignal.timeout(ms);
        },
      },
    },
  );
  return { state, helper: load('apps/worker/src/lib/s3.ts') };
}

test('actual orphan cleanup only deletes objects with its immutable upload metadata', async () => {
  for (const metadata of [{}, { 'campusforge-upload-id': 'another-operation' }]) {
    const { state, helper } = fixture();
    state.metadata = metadata;
    await helper.deleteUploadFromS3(key, uploadId);
    assert.deepEqual(
      state.commands.map((command) => command.kind),
      ['HeadObjectCommand'],
    );
    assert.equal(state.commands[0].input.Key, key);
  }
  const { state, helper } = fixture();
  state.metadata = { 'campusforge-upload-id': uploadId };
  await helper.deleteUploadFromS3(key, uploadId);
  assert.deepEqual(
    state.commands.map((command) => command.kind),
    ['HeadObjectCommand', 'DeleteObjectCommand'],
  );
  assert.equal(
    state.commands.every((command) => command.input.Key === key),
    true,
  );
  assert.equal(
    state.commands.every((command) => command.input.Bucket === 'r3-synthetic-only'),
    true,
  );
  assert.equal(
    state.commands.every((command) => command.signal instanceof AbortSignal),
    true,
  );
  assert.deepEqual(state.deadlines, [30_000, 30_000]);
});

test('actual orphan cleanup treats an already missing object as success and propagates retryable failures', async () => {
  const { state, helper } = fixture();
  state.headStatus = 404;
  await helper.deleteUploadFromS3(key, uploadId);
  assert.equal(state.commands.length, 1);
  state.headStatus = 503;
  await assert.rejects(
    helper.deleteUploadFromS3(key, uploadId),
    /Synthetic object storage failure/,
  );
  assert.equal(state.commands.length, 2);
  state.headStatus = 0;
  state.metadata = { 'campusforge-upload-id': uploadId };
  state.deleteStatus = 503;
  await assert.rejects(
    helper.deleteUploadFromS3(key, uploadId),
    /Synthetic object storage failure/,
  );
  assert.deepEqual(
    state.commands.slice(2).map((command) => command.kind),
    ['HeadObjectCommand', 'DeleteObjectCommand'],
  );
});

test('actual dispatcher producer cancels repeated open-but-stalled isolated Redis connections within its deadline', async () => {
  const sockets = new Set<Socket>();
  let connections = 0;
  let bytes = 0;
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('data', (chunk) => {
      bytes += chunk.length;
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    // Intentionally never answer the synthetic Redis handshake or commands.
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { load } = applicationLoader({}, { REDIS_URL: `redis://127.0.0.1:${address.port}/15` });
  const { dispatchDocumentParse } = load('apps/worker/src/lib/dispatch-queue.ts');
  let forcedCleanup = false;
  // A regression still releases this test's sockets, then fails its timing assertion.
  const supervisor = setTimeout(() => {
    forcedCleanup = true;
    for (const socket of sockets) socket.destroy();
  }, 5500);
  try {
    const started = performance.now();
    const attempts = await Promise.allSettled(
      Array.from({ length: 3 }, (_, i) =>
        dispatchDocumentParse(`synthetic-document-${i}`, `synthetic-parse-${i}`),
      ),
    );
    const elapsed = performance.now() - started;
    assert.equal(
      attempts.every((result) => result.status === 'rejected'),
      true,
    );
    assert.equal(forcedCleanup, false);
    assert.ok(elapsed < 4500, `Dispatcher took ${Math.round(elapsed)} ms`);
    assert.ok(connections >= 3);
    assert.ok(bytes > 0);
    await delay(100);
    assert.equal(sockets.size, 0);
    const bytesAfterDeadline = bytes;
    const connectionsAfterDeadline = connections;
    await delay(100);
    assert.equal(bytes, bytesAfterDeadline);
    assert.equal(connections, connectionsAfterDeadline);
  } finally {
    clearTimeout(supervisor);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
