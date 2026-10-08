import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentLifecycle, type PrismaClient } from '@campusforge/db';
import { createDocumentProcessor } from '../src/jobs/parse-document';
import { createDocumentDispatcher } from '../src/lifecycle/dispatcher';

type Row = Record<string, unknown>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some((part) => matches(row, part));
    if (key === 'AND') return (expected as Row[]).every((part) => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === 'in') return (value as unknown[]).includes(actual);
        if (operator === 'not') return actual !== value;
        if (operator === 'lt') return (actual as number) < (value as number);
        if (operator === 'lte') return (actual as number) <= (value as number);
        if (operator === 'gt') return (actual as number) > (value as number);
        if (operator === 'gte') return (actual as number) >= (value as number);
        throw new Error(`Unsupported mock predicate ${operator}`);
      });
    }
    return actual === expected;
  });
}
function fixture() {
  let time = Date.parse('2026-10-05T00:00:00Z');
  const now = () => new Date(time);
  const documents: Row[] = [];
  const tasks: Row[] = [];
  const intents: Row[] = [];
  let failDocumentCreate = false;
  let failDeliveryMark = false;
  function table(rows: Row[], kind: string) {
    const defaults = () => ({
      lifecycle: 'ACTIVE',
      processingStatus: 'PENDING',
      parseAttempts: 0,
      parseNextAttemptAt: now(),
      parseLeaseToken: null,
      parseLeaseUntil: null,
      status: kind === 'intent' ? 'UPLOADING' : 'PENDING',
      availableAt: now(),
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
    });
    const api = {
      async findUnique({ where }: { where: Row }) {
        return rows.find((row) => matches(row, where)) ?? null;
      },
      async findFirst({ where = {} }: { where?: Row }) {
        return rows.find((row) => matches(row, where)) ?? null;
      },
      async findMany({ where = {}, take = 100 }: { where?: Row; take?: number }) {
        return rows.filter((row) => matches(row, where)).slice(0, take);
      },
      async create({ data }: { data: Row }) {
        if (kind === 'document' && failDocumentCreate)
          throw new Error('Synthetic DB insert failure');
        if (rows.some((row) => row.id === data.id)) throw new Error('Synthetic unique constraint');
        const row = { ...defaults(), ...data };
        rows.push(row);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        if (kind === 'task' && failDeliveryMark && data.status === 'PENDING')
          throw new Error('Synthetic mark failure');
        let count = 0;
        for (const row of rows)
          if (matches(row, where)) {
            for (const [key, value] of Object.entries(data)) {
              row[key] =
                value && typeof value === 'object' && 'increment' in value
                  ? Number(row[key]) + Number(value.increment)
                  : value;
            }
            count++;
          }
        return { count };
      },
      async upsert({ where, create, update }: { where: Row; create: Row; update: Row }) {
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) return api.create({ data: create });
        Object.assign(row, update);
        return row;
      },
      async deleteMany({ where }: { where: Row }) {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i--)
          if (matches(rows[i], where)) {
            rows.splice(i, 1);
            count++;
          }
        return { count };
      },
    };
    return api;
  }
  const client = {
    document: table(documents, 'document'),
    documentTask: table(tasks, 'task'),
    documentUploadIntent: table(intents, 'intent'),
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      const snapshots = [documents, tasks, intents].map((rows) => rows.map((row) => ({ ...row })));
      try {
        return await callback(client);
      } catch (error) {
        [documents, tasks, intents].forEach((rows, index) =>
          rows.splice(0, rows.length, ...snapshots[index]),
        );
        throw error;
      }
    },
  };
  const db = client as unknown as PrismaClient;
  const lifecycle = createDocumentLifecycle(db, now);
  const input = (id: string) => ({
    id,
    storageKey: `documents/w/${id}`,
    workspaceId: 'w',
    filename: 'same.txt',
    mimeType: 'text/plain',
    sizeBytes: 5,
  });
  return {
    db,
    lifecycle,
    now,
    input,
    documents,
    tasks,
    intents,
    advance: (ms: number) => {
      time += ms;
    },
    setInsertFailure: (enabled: boolean) => {
      failDocumentCreate = enabled;
    },
    setDeliveryMarkFailure: (enabled: boolean) => {
      failDeliveryMark = enabled;
    },
  };
}

test('mock DB transaction rollback retains a cleanup ledger without touching accepted neighbor', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('first'));
  await f.lifecycle.finalizeDocumentUpload('first');
  await f.lifecycle.beginDocumentUpload(f.input('second'));
  f.setInsertFailure(true);
  await assert.rejects(f.lifecycle.finalizeDocumentUpload('second'));
  await f.lifecycle.abandonDocumentUpload('second');
  assert.equal(f.documents.length, 1);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.intents[0].status, 'FINALIZED');
  assert.equal(f.intents[1].status, 'CLEANUP');
  await f.lifecycle.abandonDocumentUpload('first');
  assert.deepEqual(await f.lifecycle.getAcceptedDocumentUpload('first'), f.documents[0]);
  assert.equal(f.intents[0].status, 'FINALIZED');
});

test('mock dispatcher retains delivered obligation after mark failure, reclaim and repeat delivery', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('doc'));
  await f.lifecycle.finalizeDocumentUpload('doc');
  const ids: string[] = [];
  const dispatcher = createDocumentDispatcher({
    db: f.db,
    now: f.now,
    batchSize: 1,
    enqueueParse: async (_id, jobId) => {
      ids.push(jobId);
    },
    deleteObject: async () => {},
    deleteUploadObject: async () => {},
  });
  f.setDeliveryMarkFailure(true);
  await assert.rejects(dispatcher.tick());
  assert.equal(f.tasks[0].status, 'CLAIMED');
  f.setDeliveryMarkFailure(false);
  f.advance(60_001);
  await dispatcher.tick();
  assert.deepEqual(ids, ['parse-doc-v1', 'parse-doc-v1']);
  assert.equal(f.tasks[0].status, 'PENDING');
});

test('mock parser duplicate delivery publishes once and ignores tombstoned in-flight parse', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('doc'));
  await f.lifecycle.finalizeDocumentUpload('doc');
  let downloads = 0;
  let release: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const process = createDocumentProcessor({
    db: f.db,
    now: f.now,
    getObject: async () => {
      downloads++;
      await paused;
      return (async function* () {
        yield Buffer.from('alpha');
      })();
    },
    parsePdf: async () => '',
  });
  const active = process('doc');
  await new Promise((resolve) => setImmediate(resolve));
  await process('doc');
  assert.equal(downloads, 1);
  await f.lifecycle.requestDocumentDeletion('doc', 'w');
  release?.();
  await active;
  assert.equal(f.documents[0].lifecycle, 'DELETING');
  assert.equal(f.documents[0].parsedText, undefined);
  assert.equal(f.tasks.find((row) => row.kind === 'PARSE')?.status, 'DONE');
});

test('mock parser replay, stale lease recovery, terminal crash budget and size mismatch', async () => {
  const f = fixture();
  for (const id of ['replay', 'crashed', 'terminal', 'size']) {
    await f.lifecycle.beginDocumentUpload(f.input(id));
    await f.lifecycle.finalizeDocumentUpload(id);
  }
  const process = createDocumentProcessor({
    db: f.db,
    now: f.now,
    getObject: async (key) =>
      (async function* () {
        yield Buffer.from(key.endsWith('size') ? 'bad' : 'alpha');
      })(),
    parsePdf: async () => '',
  });
  await process('replay');
  await process('replay');
  assert.equal(f.documents[0].parseAttempts, 1);
  Object.assign(f.documents[1], {
    processingStatus: 'PROCESSING',
    parseLeaseToken: 'dead',
    parseLeaseUntil: new Date(0),
  });
  await process('crashed');
  assert.equal(f.documents[1].processingStatus, 'COMPLETED');
  Object.assign(f.documents[2], {
    processingStatus: 'PROCESSING',
    parseAttempts: 5,
    parseLeaseToken: 'dead',
    parseLeaseUntil: new Date(0),
  });
  const dispatcher = createDocumentDispatcher({
    db: f.db,
    now: f.now,
    enqueueParse: async () => {},
    deleteObject: async () => {},
    deleteUploadObject: async () => {},
  });
  await dispatcher.tick();
  assert.equal(f.documents[2].processingStatus, 'FAILED');
  assert.equal(f.tasks.find((row) => row.documentId === 'terminal')?.status, 'DONE');
  await assert.rejects(process('size'));
  assert.equal(f.documents[3].processingStatus, 'FAILED');
});

test('mock recoverable delete retries S3 failure and repeated delete is idempotent after purge', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('doc'));
  await f.lifecycle.finalizeDocumentUpload('doc');
  assert.equal(await f.lifecycle.requestDocumentDeletion('doc', 'wrong'), false);
  await f.lifecycle.requestDocumentDeletion('doc', 'w');
  let failures = 1;
  const dispatcher = createDocumentDispatcher({
    db: f.db,
    now: f.now,
    enqueueParse: async () => {},
    deleteObject: async () => {
      if (failures-- > 0) throw new Error('S3 outage');
    },
    deleteUploadObject: async () => {},
  });
  await dispatcher.tick();
  assert.equal(f.documents[0].lifecycle, 'DELETING');
  assert.equal(f.tasks.find((row) => row.kind === 'DELETE')?.status, 'PENDING');
  f.advance(300_001);
  await dispatcher.tick();
  assert.equal(f.documents.length, 0);
  assert.equal(await f.lifecycle.requestDocumentDeletion('doc', 'w'), true);
});

test('mock abandoned upload keeps quarantine intent for late PUT and explicit 412 owns no object', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('late'));
  await f.lifecycle.abandonDocumentUpload('late');
  await f.lifecycle.beginDocumentUpload(f.input('precondition'));
  await f.lifecycle.abandonDocumentUpload('precondition', false);
  const cleaned: string[] = [];
  const dispatcher = createDocumentDispatcher({
    db: f.db,
    now: f.now,
    enqueueParse: async () => {},
    deleteObject: async () => {},
    deleteUploadObject: async (_key, id) => {
      cleaned.push(id);
    },
  });
  await dispatcher.tick();
  assert.equal(cleaned.length, 0);
  f.advance(600_001);
  await dispatcher.tick();
  assert.equal(f.intents[0].status, 'CLEANUP');
  f.advance(60_001);
  await dispatcher.tick();
  assert.deepEqual(cleaned, ['late', 'late']);
  f.advance(24 * 60 * 60_000);
  await dispatcher.tick();
  assert.equal(f.intents[0].status, 'DONE');
});

test('mock parser rejects malformed payload identity before any document claim', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload(f.input('doc'));
  await f.lifecycle.finalizeDocumentUpload('doc');
  const process = createDocumentProcessor({
    db: f.db,
    now: f.now,
    getObject: async () => {
      throw new Error('Should not download');
    },
    parsePdf: async () => '',
  });
  await assert.rejects(process(undefined as unknown as string));
  await assert.rejects(process(''));
  assert.equal(f.documents[0].processingStatus, 'PENDING');
  assert.equal(f.documents[0].parseAttempts, 0);
});

test('mock reconciler visits all missing legacy tasks beyond its bounded batch', async () => {
  const f = fixture();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    await f.lifecycle.beginDocumentUpload(f.input(id));
    await f.lifecycle.finalizeDocumentUpload(id);
  }
  f.tasks.splice(0);
  const dispatcher = createDocumentDispatcher({
    db: f.db,
    now: f.now,
    batchSize: 2,
    enqueueParse: async () => {
      throw new Error('Redis outage');
    },
    deleteObject: async () => {},
    deleteUploadObject: async () => {},
  });
  await dispatcher.tick();
  await dispatcher.tick();
  await dispatcher.tick();
  assert.equal(f.tasks.length, 5);
  assert.deepEqual(
    f.tasks.map((row) => row.id),
    ['parse-a-v1', 'parse-b-v1', 'parse-c-v1', 'parse-d-v1', 'parse-e-v1'],
  );
});

test('mock parser timeout aborts cancellable extraction and keeps a retryable obligation', async () => {
  const f = fixture();
  await f.lifecycle.beginDocumentUpload({ ...f.input('doc'), mimeType: 'application/pdf' });
  await f.lifecycle.finalizeDocumentUpload('doc');
  const process = createDocumentProcessor({
    db: f.db,
    now: f.now,
    timeoutMs: 20,
    getObject: async () =>
      (async function* () {
        yield Buffer.from('alpha');
      })(),
    parsePdf: async (_buffer, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('PDF cancellation')), {
          once: true,
        });
      }),
  });
  // Keep the synthetic process alive while the processor's timers are unref'd.
  const hold = setInterval(() => {}, 1000);
  try {
    await assert.rejects(process('doc'));
  } finally {
    clearInterval(hold);
  }
  assert.equal(f.documents[0].processingStatus, 'FAILED');
  assert.equal(f.tasks[0].status, 'PENDING');
});
