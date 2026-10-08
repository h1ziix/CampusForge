// Adapted independent audit probes. Executes current sources with infrastructure
// mocks; no .env, existing infrastructure, or AI provider is loaded.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = resolve(root, 'docs/releases/R3-evidence/baseline-source');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const ts = require('typescript');
const results = [];
const logs = [];
const quiet = Object.fromEntries(
  ['log', 'warn', 'error'].map((name) => [
    name,
    (...args) => logs.push(args.map(String).join(' ')),
  ]),
);
function load(relative, imports, extra = {}) {
  const filename = resolve(baseline, relative);
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    compiled,
    {
      module,
      exports: module.exports,
      Buffer,
      File,
      FormData,
      Headers,
      URL,
      Request,
      process: { env: {} },
      console: quiet,
      setTimeout,
      clearTimeout,
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        throw new Error(`Unmocked dependency blocked: ${name}`);
      },
      ...extra,
    },
    { filename },
  );
  return module.exports;
}
function fixture() {
  const state = {
    documents: [],
    objects: new Map(),
    queued: [],
    insertFails: false,
    enqueueFails: false,
    deleteFails: false,
    dbDeleteFails: false,
  };
  const service = load(
    'apps/web/src/server/services/document.ts',
    {
      '@campusforge/db': {
        prisma: {
          document: {
            create: async ({ data }) => {
              if (state.insertFails) throw new Error('synthetic insert failure');
              const doc = { ...data, id: `d${state.documents.length + 1}` };
              state.documents.push(doc);
              return doc;
            },
            findFirst: async ({ where }) =>
              state.documents.find((d) => d.id === where.id && d.workspaceId === where.workspaceId),
            delete: async ({ where }) => {
              if (state.dbDeleteFails) throw new Error('synthetic delete failure');
              state.documents.splice(
                state.documents.findIndex((d) => d.id === where.id),
                1,
              );
            },
          },
        },
      },
      '@/lib/s3': {
        uploadToS3: async (key, body) => state.objects.set(key, body.toString()),
        deleteFromS3: async (key) => {
          if (state.deleteFails) throw new Error('synthetic S3 outage');
          state.objects.delete(key);
        },
      },
      '@/lib/queue': {
        enqueueDocumentParsing: async (id) => {
          if (state.enqueueFails) throw new Error('synthetic Redis outage');
          state.queued.push(id);
        },
      },
    },
    {
      Date: class extends Date {
        static now() {
          return 1728000000000;
        }
      },
    },
  );
  return { state, service };
}
const input = (filename = 'lecture.txt', text = 'alpha') => ({
  workspaceId: 'csyntheticworkspace000000001',
  filename,
  mimeType: 'text/plain',
  sizeBytes: text.length,
  fileBuffer: Buffer.from(text),
});
{
  const { state, service } = fixture();
  await Promise.all([
    service.createDocument(input('a b.txt', 'alpha')),
    service.createDocument(input('a?b.txt', 'bravo')),
  ]);
  assert.equal(state.documents.length, 2);
  assert.equal(state.objects.size, 1);
  results.push({
    finding: 'PF-02',
    reproduced: true,
    scenario: 'concurrent sanitized collision at fixed timestamp',
    documentRows: 2,
    objects: 1,
    firstBytes: state.objects.get(state.documents[0].storageKey),
  });
}
{
  const { state, service } = fixture();
  await service.createDocument(input());
  state.insertFails = true;
  await service.createDocument(input('lecture.txt', 'bravo'));
  assert.equal(state.documents.length, 1);
  assert.equal(state.objects.size, 0);
  results.push({
    finding: 'PF-02',
    reproduced: true,
    scenario: 'DB failure cleanup removes neighbor object',
    survivingRows: 1,
    objects: 0,
  });
}
{
  const { state, service } = fixture();
  state.enqueueFails = true;
  const response = await service.createDocument(input());
  assert.equal(response.ok, true);
  assert.equal(state.queued.length, 0);
  results.push({
    finding: 'PF-03',
    reproduced: true,
    response,
    documentStatus: state.documents[0].processingStatus,
    queued: 0,
  });
}
for (const failure of ['deleteFails', 'dbDeleteFails']) {
  const { state, service } = fixture();
  await service.createDocument(input());
  state[failure] = true;
  let outcome;
  try {
    outcome = await service.deleteDocument('d1', input().workspaceId);
  } catch {
    outcome = 'rejected';
  }
  assert.equal(state.documents.length, failure === 'deleteFails' ? 0 : 1);
  assert.equal(state.objects.size, failure === 'deleteFails' ? 1 : 0);
  results.push({
    finding: 'PF-08',
    reproduced: true,
    failure,
    outcome,
    documentRows: state.documents.length,
    objects: state.objects.size,
  });
}
{
  let calls = 0;
  const origin = load(
    'apps/web/src/lib/request-origin.ts',
    {},
    { process: { env: { AUTH_URL: 'https://campusforge.example' } } },
  );
  const schema = load('packages/shared/src/schemas/document.ts', { zod: require('zod') });
  const route = load('apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts', {
    'next/server': require('next/server'),
    '@/lib/auth': { auth: async () => ({ user: { id: 'synthetic' } }) },
    '@campusforge/db': { prisma: { membership: { findUnique: async () => ({ id: 'member' }) } } },
    '@campusforge/shared': schema,
    '@/lib/request-origin': origin,
    '@/server/services/document': {
      createDocument: async () => {
        calls++;
        return { ok: true, documentId: 'synthetic' };
      },
    },
  });
  const form = new FormData();
  form.set('file', new File(['x'], 'notes.txt', { type: 'text/plain' }));
  form.set('ignored', new File([Buffer.alloc(11 * 1024 * 1024)], 'ignored.bin'));
  const request = new Request('https://campusforge.example/api/upload', {
    method: 'POST',
    headers: { origin: 'https://campusforge.example' },
    body: form,
  });
  const bytes = (await request.clone().arrayBuffer()).byteLength;
  const response = await route.POST(request, {
    params: Promise.resolve({ workspaceId: input().workspaceId }),
  });
  assert.equal(response.status, 201);
  assert.equal(calls, 1);
  results.push({
    finding: 'PF-06',
    reproduced: true,
    scenario: 'actual upload route; tiny selected file and ignored 11 MiB part',
    bodyBytes: bytes,
    response: response.status,
    createCalls: calls,
  });
}
{
  const clients = [],
    queues = [];
  let connections = 0;
  const refusal = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  await new Promise((done) => refusal.listen(0, '127.0.0.1', done));
  const Redis = require('ioredis'),
    { Queue } = require('bullmq');
  class TrackedRedis extends Redis {
    constructor(...args) {
      super(...args);
      clients.push(this);
      this.on('error', () => {});
    }
  }
  class TrackedQueue extends Queue {
    constructor(...args) {
      super(...args);
      queues.push(this);
      this.on('error', () => {});
    }
  }
  const source = load(
    'apps/web/src/lib/queue.ts',
    { ioredis: TrackedRedis, bullmq: { Queue: TrackedQueue } },
    { process: { env: { REDIS_URL: `redis://127.0.0.1:${refusal.address().port}/15` } } },
  );
  let outcome = 'pending';
  const started = performance.now();
  source.enqueueDocumentParsing('r3-baseline-synthetic').then(
    () => {
      outcome = 'resolved';
    },
    () => {
      outcome = 'rejected';
    },
  );
  await new Promise((done) => setTimeout(done, 1500));
  assert.equal(outcome, 'pending');
  results.push({
    finding: 'PF-05',
    reproduced: true,
    endpoint: 'close-only loopback TCP; zero real Redis writes',
    observedMs: Math.round(performance.now() - started),
    connections,
    outcome,
    maxRetriesPerRequest: clients[0].options.maxRetriesPerRequest,
    enableOfflineQueue: clients[0].options.enableOfflineQueue,
  });
  clients.forEach((client) => client.disconnect(false));
  await Promise.all(queues.map((queue) => queue.close()));
  await new Promise((done) => refusal.close(done));
}
const evidence = resolve(root, 'docs/releases/R3-evidence');
mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(evidence, 'baseline-source.json'), 'utf8'));
for (const file of manifest.files)
  assert.equal(
    createHash('sha256')
      .update(readFileSync(resolve(baseline, file.path)))
      .digest('hex'),
    file.sha256,
  );
writeFileSync(
  resolve(evidence, 'baseline-findings.json'),
  JSON.stringify(
    {
      executedAt: new Date().toISOString(),
      node: process.version,
      gitRevision: manifest.gitRevision,
      scope:
        'snapshotted pre-R3 actual application entrances with mocks; isolated Redis transport probe',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    scenarios: results.length,
    findings: [...new Set(results.map((result) => result.finding))],
    evidence: 'docs/releases/R3-evidence/baseline-findings.json',
  }),
);
