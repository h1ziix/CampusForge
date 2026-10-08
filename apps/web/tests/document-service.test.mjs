import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applicationLoader } from '../../../tests/fixtures/r3-source-loader.mjs';

const workspaceId = 'csyntheticworkspace000000001';
const input = (filename = 'notes.txt', text = 'Synthetic source bytes') => ({
  workspaceId,
  filename,
  mimeType: 'text/plain',
  sizeBytes: Buffer.byteLength(text),
  fileBuffer: Buffer.from(text),
});

// This suite executes actual upload service + S3 helpers. Only external DB/SDK
// boundaries are mocked; real PostgreSQL/S3 concurrency is covered separately.
function fixture() {
  const state = {
    intents: new Map(),
    documents: new Map(),
    tasks: new Map(),
    objects: new Map(),
    commands: [],
    configuration: [],
    deadlines: [],
    abandoned: [],
    deletes: [],
    nextIds: [],
    beginFails: false,
    finalizeFails: false,
    failFinalizationFor: null,
    commitThenFail: false,
    lookupFails: false,
    abandonFails: false,
    putThenFail: false,
  };
  class Command {
    constructor(value) {
      this.input = value;
    }
  }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class S3Client {
    constructor(configuration) {
      state.configuration.push(configuration);
    }
    async send(command, options) {
      state.commands.push({ command, options });
      const { Key: key } = command.input;
      if (command instanceof PutObjectCommand) {
        if (command.input.IfNoneMatch === '*' && state.objects.has(key)) {
          throw Object.assign(new Error('Synthetic conditional PUT conflict'), {
            $metadata: { httpStatusCode: 412 },
          });
        }
        state.objects.set(key, {
          body: Buffer.from(command.input.Body),
          metadata: { ...command.input.Metadata },
        });
        if (state.putThenFail) throw new Error('Synthetic lost PUT acknowledgement');
      }
      if (command instanceof DeleteObjectCommand) state.objects.delete(key);
      return { Body: state.objects.get(key)?.body };
    }
  }
  const db = {
    async beginDocumentUpload(value) {
      if (state.beginFails) throw new Error('Synthetic intent insert failure');
      assert.equal(state.intents.has(value.id), false);
      state.intents.set(value.id, { ...value, status: 'UPLOADING' });
    },
    async finalizeDocumentUpload(id) {
      const intent = state.intents.get(id);
      if (state.finalizeFails || intent.filename === state.failFinalizationFor) {
        throw new Error('Synthetic acceptance transaction rollback');
      }
      const doc = { ...intent, lifecycle: 'ACTIVE', processingStatus: 'PENDING' };
      state.documents.set(id, doc);
      state.tasks.set(`parse-${id}-v1`, { id: `parse-${id}-v1`, documentId: id });
      intent.status = 'FINALIZED';
      if (state.commitThenFail) throw new Error('Synthetic lost commit acknowledgement');
      return { id };
    },
    async getAcceptedDocumentUpload(id) {
      if (state.lookupFails) throw new Error('Synthetic DB read outage');
      return state.documents.has(id) ? { id } : null;
    },
    async abandonDocumentUpload(id, objectMayExist = true) {
      state.abandoned.push({ id, objectMayExist });
      if (state.abandonFails) throw new Error('Synthetic DB abandon outage');
      const intent = state.intents.get(id);
      if (intent.status === 'UPLOADING') intent.status = objectMayExist ? 'CLEANUP' : 'DONE';
    },
    async requestDocumentDeletion(id, workspace) {
      state.deletes.push({ id, workspace });
      return id === 'known-document' && workspace === workspaceId;
    },
  };
  const { load } = applicationLoader(
    {
      '@campusforge/db': db,
      '@campusforge/shared': { MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024 },
      'node:crypto': { randomUUID: () => state.nextIds.shift() ?? randomUUID() },
      '@aws-sdk/client-s3': { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand },
    },
    {
      S3_BUCKET: 'r3-synthetic-only',
      S3_ENDPOINT: 'http://synthetic.invalid',
      S3_ACCESS_KEY: 'synthetic-access',
      S3_SECRET_KEY: 'synthetic-secret',
    },
    {
      Date: class extends Date {
        static now() {
          return 1728000000000;
        }
      },
      AbortSignal: {
        timeout(ms) {
          state.deadlines.push(ms);
          return AbortSignal.timeout(ms);
        },
      },
    },
  );
  return {
    state,
    service: load('apps/web/src/server/services/document.ts'),
    storage: load('apps/web/src/lib/s3.ts'),
  };
}

test('actual service keeps 100 concurrent same-name/colliding-name objects independent at fixed timestamp', async () => {
  const { state, service } = fixture();
  const uploads = Array.from({ length: 100 }, (_, i) =>
    input(['same.txt', 'a b.txt', 'a?b.txt'][i % 3], `Synthetic independent bytes ${i}`),
  );
  const results = await Promise.all(uploads.map((value) => service.createDocument(value)));
  assert.equal(
    results.every((result) => result.ok),
    true,
  );
  assert.equal(new Set(results.map((result) => result.documentId)).size, 100);
  assert.equal(state.objects.size, 100);
  assert.equal(state.documents.size, 100);
  assert.equal(state.tasks.size, 100);
  for (const [i, result] of results.entries()) {
    const doc = state.documents.get(result.documentId);
    assert.equal(doc.filename, uploads[i].filename);
    assert.equal(doc.storageKey, `documents/${workspaceId}/${doc.id}`);
    assert.equal(
      state.objects.get(doc.storageKey).body.toString(),
      uploads[i].fileBuffer.toString(),
    );
    assert.equal(state.objects.get(doc.storageKey).metadata['campusforge-upload-id'], doc.id);
  }
  assert.equal(
    state.commands.every(({ command }) => command.input.IfNoneMatch === '*'),
    true,
  );
});

test('actual service records retryable ownership after one acceptance failure without deleting neighbouring objects', async () => {
  const { state, service } = fixture();
  state.failFinalizationFor = 'fails.txt';
  const [good, bad] = await Promise.all([
    service.createDocument(input('good.txt', 'good retained bytes')),
    service.createDocument(input('fails.txt', 'only this upload needs cleanup')),
  ]);
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);
  assert.equal(state.documents.size, 1);
  assert.equal(state.tasks.size, 1);
  assert.equal(state.objects.size, 2);
  assert.equal(
    state.objects.get(state.documents.get(good.documentId).storageKey).body.toString(),
    'good retained bytes',
  );
  const abandoned = [...state.intents.values()].find((intent) => intent.filename === 'fails.txt');
  assert.equal(abandoned.status, 'CLEANUP');
  assert.equal(
    state.commands.some(({ command }) => command.constructor.name === 'DeleteObjectCommand'),
    false,
  );
});

test('actual service does no PUT on intent insert failure or invalid actual file size', async () => {
  const { state, service } = fixture();
  state.beginFails = true;
  assert.equal((await service.createDocument(input())).ok, false);
  assert.equal(state.commands.length, 0);
  assert.equal(state.intents.size, 0);
  assert.equal(state.abandoned.length, 0);
  state.beginFails = false;
  assert.equal((await service.createDocument({ ...input(), sizeBytes: 999 })).ok, false);
  assert.equal(state.commands.length, 0);
  assert.equal(state.intents.size, 0);
});

test('actual service resolves an ambiguous committed transaction by persisted acceptance', async () => {
  const { state, service } = fixture();
  state.commitThenFail = true;
  const result = await service.createDocument(input());
  assert.equal(result.ok, true);
  assert.equal(state.intents.get(result.documentId).status, 'FINALIZED');
  assert.equal(state.tasks.size, 1);
  assert.equal(state.abandoned.length, 0);
  assert.equal(state.objects.size, 1);
});

test('unknown DB acknowledgement never cleans an already accepted object or cancels its task', async () => {
  const { state, service } = fixture();
  state.commitThenFail = true;
  state.lookupFails = true;
  const result = await service.createDocument(input());
  assert.equal(result.ok, false);
  assert.equal([...state.intents.values()][0].status, 'FINALIZED');
  assert.equal(state.documents.size, 1);
  assert.equal(state.tasks.size, 1);
  assert.equal(state.objects.size, 1);
  assert.equal(state.commands.length, 1);
});

test('known 412 conditional PUT rejection preserves the existing stranger and never schedules its deletion', async () => {
  const { state, service } = fixture();
  const id = randomUUID();
  state.nextIds.push(id);
  const key = `documents/${workspaceId}/${id}`;
  state.objects.set(key, {
    body: Buffer.from('stranger bytes'),
    metadata: { 'campusforge-upload-id': 'different-upload' },
  });
  assert.equal((await service.createDocument(input())).ok, false);
  assert.equal(state.objects.get(key).body.toString(), 'stranger bytes');
  assert.equal(state.intents.get(id).status, 'DONE');
  assert.deepEqual(state.abandoned, [{ id, objectMayExist: false }]);
  assert.equal(state.documents.size, 0);
  assert.equal(state.tasks.size, 0);
  assert.equal(state.commands.length, 1);
});

test('ambiguous PUT and failed abandon retain an UPLOADING ledger for expiry recovery', async () => {
  const { state, service } = fixture();
  state.putThenFail = true;
  state.abandonFails = true;
  assert.equal((await service.createDocument(input())).ok, false);
  const intent = [...state.intents.values()][0];
  assert.equal(intent.status, 'UPLOADING');
  assert.equal(state.objects.get(intent.storageKey).metadata['campusforge-upload-id'], intent.id);
  assert.equal(state.documents.size, 0);
  assert.equal(state.tasks.size, 0);
});

test('actual SDK commands enforce bounded metadata, conditional PUT and abortable 30s operation policy', async () => {
  const { state, storage } = fixture();
  const id = randomUUID();
  const shortName = 'Лекция.txt';
  await storage.uploadToS3(`short/${id}`, Buffer.from('x'), 'text/plain', shortName, id);
  await storage.uploadToS3(
    `long/${id}`,
    Buffer.from('x'),
    'text/plain',
    `${'文'.repeat(490)}.txt`,
    id,
  );
  await storage.uploadToS3(`surrogate/${id}`, Buffer.from('x'), 'text/plain', '\ud800.txt', id);
  await storage.getFromS3(`short/${id}`);
  await storage.deleteFromS3(`short/${id}`);
  assert.equal(
    state.commands[0].command.input.Metadata['original-filename'],
    encodeURIComponent(shortName),
  );
  assert.equal(state.commands[1].command.input.Metadata['original-filename'], undefined);
  assert.equal(state.commands[2].command.input.Metadata['original-filename'], undefined);
  for (const { command, options } of state.commands) {
    assert.ok(options.abortSignal instanceof AbortSignal);
    if (command.input.Metadata) {
      const totalBytes = Object.entries(command.input.Metadata).reduce(
        (sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(value),
        0,
      );
      assert.ok(totalBytes <= 2048);
      assert.equal(command.input.Metadata['campusforge-upload-id'], id);
      assert.equal(command.input.IfNoneMatch, '*');
    }
  }
  assert.equal(state.configuration[0].maxAttempts, 1);
  assert.deepEqual(state.deadlines, [30_000, 30_000, 30_000, 30_000, 30_000]);
});

test('actual delete service delegates only to durable tombstone transaction and is safe to repeat', async () => {
  const { state, service } = fixture();
  for (let i = 0; i < 2; i++)
    assert.equal((await service.deleteDocument('known-document', workspaceId)).ok, true);
  assert.equal((await service.deleteDocument('known-document', 'other-workspace')).ok, false);
  assert.equal((await service.deleteDocument('unknown-document', workspaceId)).ok, false);
  assert.equal(state.deletes.length, 4);
  assert.equal(state.commands.length, 0);
});
