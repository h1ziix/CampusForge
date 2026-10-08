// Real disposable PostgreSQL/Redis/MinIO. Actual services, guarded route,
// dispatcher and processors execute; only declared failure points and AI are
// injected. All resources belong to this run and are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  isolatedInfrastructure,
  syntheticChildEnv,
  stagedPrismaMigrations,
} from '../tests/fixtures/r3-infrastructure.mjs';
import { applicationLoader, deferred, root } from '../tests/fixtures/r3-source-loader.mjs';

const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const requireWorker = createRequire(resolve(root, 'apps/worker/package.json'));
const requireDB = createRequire(resolve(root, 'packages/db/package.json'));
const sdk = requireWeb('@aws-sdk/client-s3');
const { Queue, Worker } = requireWorker('bullmq');
const Redis = requireWorker('ioredis');
const results = [];
const resources = [];
let infra, prisma, s3, redis, queue, workerProcess, migrationStage;
const evidence = resolve(root, 'docs/releases/R3-evidence');
mkdirSync(evidence, { recursive: true });
const scenario = async (name, operation) => {
  const started = performance.now();
  try {
    const details = await operation();
    results.push({
      name,
      passed: true,
      elapsedMs: Math.round(performance.now() - started),
      ...details,
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.message,
      elapsedMs: Math.round(performance.now() - started),
    });
    throw error;
  }
};
const overridden = (db, overrides) =>
  new Proxy(db, {
    get(target, name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
const forceVisible = async (id) =>
  prisma.documentTask.updateMany({
    where: { documentId: id, status: { not: 'DONE' } },
    data: { availableAt: new Date(0), leaseUntil: new Date(0) },
  });
const stopWorkerProcess = async () => {
  if (!workerProcess) return;
  const child = workerProcess;
  workerProcess = undefined;
  if (child.exitCode !== null) return;
  const stopped = new Promise((done) => child.once('exit', done));
  child.kill();
  await stopped;
};

try {
  assert.match(process.version, /^v24\./, 'Use the supported Node24 runtime');
  infra = await isolatedInfrastructure();
  migrationStage = await stagedPrismaMigrations();
  const migration = spawnSync(
    process.execPath,
    [
      requireDB.resolve('prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      migrationStage.schema,
    ],
    {
      cwd: migrationStage.directory,
      env: syntheticChildEnv(infra.environment),
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
  writeFileSync(
    resolve(evidence, 'integration-migration.log'),
    migration.stdout + migration.stderr,
  );
  assert.equal(
    migration.status,
    0,
    'Migration must apply only to the freshly created disposable database',
  );
  const { PrismaClient } = requireDB(resolve(root, 'packages/db/generated/client'));
  assert.doesNotMatch(migration.stdout + migration.stderr, /Environment variables loaded from/);
  prisma = new PrismaClient({
    datasources: { db: { url: `${infra.environment.DATABASE_URL}?connection_limit=12` } },
  });
  s3 = new sdk.S3Client({
    endpoint: infra.environment.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: infra.environment.S3_ACCESS_KEY,
      secretAccessKey: infra.environment.S3_SECRET_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 1,
  });
  await s3.send(new sdk.CreateBucketCommand({ Bucket: infra.environment.S3_BUCKET }));
  redis = new Redis(infra.environment.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', () => {});
  queue = new Queue('document-processing', { connection: redis });
  queue.on('error', () => {});
  await queue.waitUntilReady();
  const user = await prisma.user.create({
    data: { email: `synthetic-${infra.id}@example.invalid` },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'R3 isolated test', type: 'PERSONAL', ownerId: user.id },
  });
  await prisma.membership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
  });
  const lifecycleModule = applicationLoader({ './client': { prisma } }).load(
    'packages/db/src/document-lifecycle.ts',
  );
  const lifecycle = lifecycleModule.createDocumentLifecycle(prisma);
  const dbExports = { prisma, ...lifecycleModule, ...lifecycle };
  const shared = applicationLoader().load('packages/shared/src/schemas/document.ts');
  const buildLoader = (mocks = {}) =>
    applicationLoader(
      {
        '@campusforge/db': dbExports,
        '@campusforge/shared': {
          ...shared,
          ok: (data) => ({ ok: true, data }),
          err: (error) => ({ ok: false, error }),
        },
        '@aws-sdk/client-s3': sdk,
        '../lib/pdf': {
          extractPdfText: async () => {
            throw new Error('PDF is independently tested; this fixture uses UTF-8');
          },
        },
        '@/lib/auth': { auth: async () => ({ user: { id: user.id } }) },
        '@/server/services/auth-helpers': {
          requireAuth: async () => user,
          requireWorkspaceMember: async (_id, ws) => {
            assert.equal(ws, workspace.id);
          },
        },
        ...mocks,
      },
      { ...infra.environment, AUTH_URL: 'https://campusforge.example' },
      {
        Date: class extends Date {
          static now() {
            return 1728000000000;
          }
        },
      },
    );
  const { load } = buildLoader();
  const service = load('apps/web/src/server/services/document.ts');
  const route = load('apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts');
  const workerS3 = load('apps/worker/src/lib/s3.ts');
  const { createDocumentProcessor } = load('apps/worker/src/jobs/parse-document.ts');
  const { createDocumentDispatcher } = load('apps/worker/src/lifecycle/dispatcher.ts');
  const { dispatchDocumentParse } = load('apps/worker/src/lib/dispatch-queue.ts');
  const parser = createDocumentProcessor({
    db: prisma,
    getObject: workerS3.getFromS3,
    parsePdf: async () => '',
    timeoutMs: 5000,
  });
  const dispatcher = (options = {}) =>
    createDocumentDispatcher({
      db: prisma,
      enqueueParse: dispatchDocumentParse,
      deleteObject: workerS3.deleteFromS3,
      deleteUploadObject: workerS3.deleteUploadFromS3,
      batchSize: 200,
      visibilityMs: 5000,
      leaseMs: 500,
      ...options,
    });
  const created = async (
    text = 'R3 synthetic text',
    filename = 'lecture.txt',
    source = service,
  ) => {
    const result = await source.createDocument({
      workspaceId: workspace.id,
      filename,
      mimeType: 'text/plain',
      fileBuffer: Buffer.from(text),
      sizeBytes: Buffer.byteLength(text),
    });
    assert.equal(result.ok, true);
    return prisma.document.findUniqueOrThrow({ where: { id: result.documentId } });
  };
  const stored = async (key) =>
    (
      await s3.send(new sdk.GetObjectCommand({ Bucket: infra.environment.S3_BUCKET, Key: key }))
    ).Body.transformToString();
  const absent = async (key) =>
    assert.rejects(
      s3.send(new sdk.GetObjectCommand({ Bucket: infra.environment.S3_BUCKET, Key: key })),
      (error) => error.$metadata?.httpStatusCode === 404,
    );

  await scenario('fresh disposable migration applied without touching existing data', async () => ({
    migration: '20261005120000_document_durable_lifecycle',
    taskRows: await prisma.documentTask.count(),
  }));
  await scenario(
    'actual authenticated/membership-guarded HTTP upload reaches PostgreSQL and MinIO',
    async () => {
      const form = new FormData();
      form.set(
        'file',
        new File(['R3 actual entrance sentinel'], 'entrance.txt', { type: 'text/plain' }),
      );
      const response = await route.POST(
        new Request('https://campusforge.example/api/upload', {
          method: 'POST',
          headers: { origin: 'https://campusforge.example' },
          body: form,
        }),
        { params: Promise.resolve({ workspaceId: workspace.id }) },
      );
      assert.equal(response.status, 201);
      const data = await response.json();
      assert.equal(data.processingStatus, 'PENDING');
      const doc = await prisma.document.findUniqueOrThrow({ where: { id: data.documentId } });
      assert.equal(await stored(doc.storageKey), 'R3 actual entrance sentinel');
      assert.equal(
        (
          await prisma.documentTask.findUniqueOrThrow({
            where: { id: lifecycleModule.parseTaskId(doc.id) },
          })
        ).status,
        'PENDING',
      );
      await parser(doc.id);
      return {
        response: 201,
        parseStatus: (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
          .processingStatus,
      };
    },
  );
  await scenario(
    '100 concurrent fixed-time same/colliding-name uploads have independent objects and bytes',
    async () => {
      const uploads = await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          created(`bytes-${index}`, index % 2 ? 'a b.txt' : 'a?b.txt'),
        ),
      );
      assert.equal(new Set(uploads.map((doc) => doc.storageKey)).size, 100);
      const contents = await Promise.all(uploads.map((doc) => stored(doc.storageKey)));
      contents.forEach((content, index) => assert.equal(content, `bytes-${index}`));
      assert.equal(
        await prisma.documentTask.count({
          where: { documentId: { in: uploads.map((doc) => doc.id) } },
        }),
        100,
      );
      await Promise.all(uploads.map((doc) => parser(doc.id)));
      return {
        documents: 100,
        independentObjects: 100,
        parsed: await prisma.document.count({
          where: { id: { in: uploads.map((doc) => doc.id) }, processingStatus: 'COMPLETED' },
        }),
      };
    },
  );
  await scenario(
    'conditional S3 PUT refuses overwrite and foreign ownership cleanup preserves bytes',
    async () => {
      const id = randomUUID(),
        key = `documents/${workspace.id}/${id}`;
      await s3.send(
        new sdk.PutObjectCommand({
          Bucket: infra.environment.S3_BUCKET,
          Key: key,
          Body: 'FOREIGN',
          Metadata: { 'campusforge-upload-id': randomUUID() },
        }),
      );
      const webS3 = load('apps/web/src/lib/s3.ts');
      await assert.rejects(
        webS3.uploadToS3(key, Buffer.from('overwrite'), 'text/plain', 'x.txt', id),
        (error) => error.$metadata?.httpStatusCode === 412,
      );
      await workerS3.deleteUploadFromS3(key, id);
      assert.equal(await stored(key), 'FOREIGN');
      return { overwriteRejected: 412, bytesPreserved: true };
    },
  );
  await scenario(
    'S3 success then real transaction failure rolls back document/task and retains recoverable cleanup',
    async () => {
      const before = await prisma.document.count();
      const broken = overridden(prisma, {
        $transaction: (callback) =>
          prisma.$transaction((tx) =>
            callback(
              overridden(tx, {
                documentTask: overridden(tx.documentTask, {
                  create: async () => {
                    throw new Error('Injected DB task insert failure');
                  },
                }),
              }),
            ),
          ),
      });
      const failLifecycle = lifecycleModule.createDocumentLifecycle(broken);
      const faultyService = buildLoader({
        '@campusforge/db': { ...dbExports, ...failLifecycle },
      }).load('apps/web/src/server/services/document.ts');
      const result = await faultyService.createDocument({
        workspaceId: workspace.id,
        filename: 'failure.txt',
        mimeType: 'text/plain',
        fileBuffer: Buffer.from('cleanup-only'),
        sizeBytes: 12,
      });
      assert.equal(result.ok, false);
      assert.equal(await prisma.document.count(), before);
      const intent = await prisma.documentUploadIntent.findFirstOrThrow({
        where: { status: 'CLEANUP' },
        orderBy: { createdAt: 'desc' },
      });
      assert.equal(await stored(intent.storageKey), 'cleanup-only');
      await prisma.documentUploadIntent.update({
        where: { id: intent.id },
        data: { availableAt: new Date(0), cleanupUntil: new Date(0) },
      });
      await dispatcher().tick();
      await absent(intent.storageKey);
      return { rolledBack: true, durableCleanup: true };
    },
  );
  await scenario(
    'ambiguous DB commit response returns persisted acceptance and preserves its object',
    async () => {
      const faultyService = buildLoader({
        '@campusforge/db': {
          ...dbExports,
          finalizeDocumentUpload: async (id) => {
            await lifecycle.finalizeDocumentUpload(id);
            throw new Error('Injected lost transaction response');
          },
        },
      }).load('apps/web/src/server/services/document.ts');
      const doc = await created('accepted-despite-lost-response', 'accepted.txt', faultyService);
      assert.equal(await stored(doc.storageKey), 'accepted-despite-lost-response');
      assert.equal(
        (await prisma.documentUploadIntent.findUniqueOrThrow({ where: { id: doc.id } })).status,
        'FINALIZED',
      );
      await parser(doc.id);
      return { honestAcceptance: true };
    },
  );
  await scenario(
    'upload crash after PUT before finalization expires to durable owned cleanup',
    async () => {
      const id = randomUUID(),
        key = `documents/${workspace.id}/${id}`;
      await lifecycle.beginDocumentUpload({
        id,
        storageKey: key,
        workspaceId: workspace.id,
        filename: 'crash.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
      });
      await load('apps/web/src/lib/s3.ts').uploadToS3(
        key,
        Buffer.from('crash'),
        'text/plain',
        'crash.txt',
        id,
      );
      await prisma.documentUploadIntent.update({
        where: { id },
        data: { expiresAt: new Date(0), availableAt: new Date(0), cleanupUntil: new Date(0) },
      });
      await dispatcher().tick();
      await absent(key);
      assert.equal(await prisma.document.count({ where: { id } }), 0);
      return { orphanDiscovered: true };
    },
  );

  await scenario(
    'durable commit survives actual Redis outage and parses after Redis recovery',
    async () => {
      infra.pauseRedis();
      let doc;
      try {
        doc = await created('redis outage durable bytes');
        const started = performance.now();
        await dispatcher().tick();
        assert.ok(performance.now() - started < 6000);
        const task = await prisma.documentTask.findUniqueOrThrow({
          where: { id: lifecycleModule.parseTaskId(doc.id) },
        });
        assert.notEqual(task.status, 'DONE');
        assert.equal(await stored(doc.storageKey), 'redis outage durable bytes');
      } finally {
        infra.unpauseRedis();
      }
      await delay(100);
      await forceVisible(doc.id);
      await dispatcher().tick();
      assert.ok(await queue.getJob(lifecycleModule.parseTaskId(doc.id)));
      await parser(doc.id);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).parsedText,
        'redis outage durable bytes',
      );
      return { recovered: true, task: 'DONE' };
    },
  );
  await scenario(
    'two dispatcher instances atomically claim each durable operation once',
    async () => {
      const docs = await Promise.all(Array.from({ length: 8 }, (_, i) => created(`multi-${i}`)));
      const calls = [];
      const enqueue = async (id, jobId) => {
        calls.push({ id, jobId });
        await dispatchDocumentParse(id, jobId);
      };
      await Promise.all([
        dispatcher({ enqueueParse: enqueue }).tick(),
        dispatcher({ enqueueParse: enqueue }).tick(),
      ]);
      for (const doc of docs) assert.equal(calls.filter((call) => call.id === doc.id).length, 1);
      await Promise.all(docs.map((doc) => parser(doc.id)));
      return { operations: 8, duplicateClaims: 0 };
    },
  );
  await scenario(
    'queue.add success then delivery mark failure retries with stable job identity',
    async () => {
      const doc = await created('dispatch response lost');
      let queued = false;
      const broken = overridden(prisma, {
        documentTask: overridden(prisma.documentTask, {
          updateMany: async (args) => {
            if (queued && args.data.status === 'PENDING') {
              queued = false;
              throw new Error('Injected post-queue DB failure');
            }
            return prisma.documentTask.updateMany(args);
          },
        }),
      });
      await dispatcher({
        db: broken,
        enqueueParse: async (id, jobId) => {
          await dispatchDocumentParse(id, jobId);
          queued = true;
        },
      }).tick();
      assert.ok(await queue.getJob(lifecycleModule.parseTaskId(doc.id)));
      await forceVisible(doc.id);
      await dispatcher().tick();
      assert.ok(await queue.getJob(lifecycleModule.parseTaskId(doc.id)));
      await parser(doc.id);
      await parser(doc.id);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).parseAttempts,
        1,
      );
      return { stableIdentity: true, persistedParseExecutions: 1 };
    },
  );
  await scenario(
    'outbox survives removed BullMQ record and dispatcher restart/expired lease',
    async () => {
      const doc = await created('record removed; still durable');
      await dispatcher().tick();
      const first = await queue.getJob(lifecycleModule.parseTaskId(doc.id));
      assert.ok(first);
      await first.remove();
      await prisma.documentTask.update({
        where: { id: lifecycleModule.parseTaskId(doc.id) },
        data: {
          status: 'CLAIMED',
          leaseToken: randomUUID(),
          leaseUntil: new Date(0),
          availableAt: new Date(0),
        },
      });
      await dispatcher().tick();
      assert.ok(await queue.getJob(lifecycleModule.parseTaskId(doc.id)));
      await parser(doc.id);
      return { redisRecordIndependent: true };
    },
  );
  await scenario(
    'actual BullMQ worker processes/replays only once using persisted leases',
    async () => {
      const doc = await created('real bullmq worker body');
      const worker = new Worker('document-processing', async (job) => parser(job.data.documentId), {
        connection: redis,
        concurrency: 3,
      });
      worker.on('error', () => {});
      resources.push(worker);
      await worker.waitUntilReady();
      await dispatcher().tick();
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).processingStatus ===
          'COMPLETED'
        )
          break;
        if (attempt === 99) throw new Error('Synthetic BullMQ processing deadline exceeded');
        await delay(50);
      }
      await dispatchDocumentParse(doc.id, `replay-${randomUUID()}`);
      await delay(100);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).parseAttempts,
        1,
      );
      await worker.close();
      resources.splice(resources.indexOf(worker), 1);
      return { realRedisWorker: true, replayPersistedExecutions: 1 };
    },
  );
  await scenario(
    'concurrent parser delivery and expired PROCESSING lease recover safely',
    async () => {
      const doc = await created('parse lease concurrency');
      let reads = 0;
      const processor = createDocumentProcessor({
        db: prisma,
        getObject: async (key, signal) => {
          reads++;
          return workerS3.getFromS3(key, signal);
        },
        parsePdf: async () => '',
        timeoutMs: 5000,
      });
      await Promise.all([processor(doc.id), processor(doc.id), processor(doc.id)]);
      assert.equal(reads, 1);
      const stale = await created('after crash restart');
      await prisma.document.update({
        where: { id: stale.id },
        data: {
          processingStatus: 'PROCESSING',
          parseLeaseToken: randomUUID(),
          parseLeaseUntil: new Date(0),
          parseAttempts: 1,
        },
      });
      await processor(stale.id);
      const recovered = await prisma.document.findUniqueOrThrow({ where: { id: stale.id } });
      assert.equal(recovered.processingStatus, 'COMPLETED');
      assert.equal(recovered.parseAttempts, 2);
      return { concurrentReads: 1, expiredLeaseRecovered: true };
    },
  );
  await scenario(
    'accepted deletion hides normal queries/actions and pending Redis jobs before cleanup',
    async () => {
      const doc = await created('delete visibility');
      await parser(doc.id);
      await service.deleteDocument(doc.id, workspace.id);
      const queries = load('apps/web/src/server/queries/document.ts');
      assert.equal(await queries.getDocumentById(doc.id, workspace.id), null);
      assert.ok(
        !(await queries.getWorkspaceDocuments(workspace.id)).some((item) => item.id === doc.id),
      );
      const forms = new FormData();
      forms.set('documentId', doc.id);
      forms.set('workspaceId', workspace.id);
      assert.equal(
        (await load('apps/web/src/server/actions/summary.ts').generateSummaryAction(forms)).ok,
        false,
      );
      assert.equal(
        (await load('apps/web/src/server/actions/flashcard.ts').generateFlashcardsAction(forms)).ok,
        false,
      );
      await parser(doc.id);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).lifecycle,
        'DELETING',
      );
      await dispatcher().tick();
      assert.equal(await prisma.document.count({ where: { id: doc.id } }), 0);
      return { hiddenImmediately: true };
    },
  );
  await scenario(
    'delete S3 failure/restart retains intent; missing object and repeated deletion are safe',
    async () => {
      const doc = await created('retry delete bytes');
      const existingSet = await prisma.flashcardSet.create({
        data: {
          workspaceId: workspace.id,
          sourceDocumentId: doc.id,
          title: 'Retained artifact',
          cardsJson: [{ front: 'Q', back: 'A' }],
          cardCount: 1,
        },
      });
      await service.deleteDocument(doc.id, workspace.id);
      await dispatcher({
        deleteObject: async () => {
          throw new Error('Injected S3 delete outage');
        },
      }).tick();
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).lifecycle,
        'DELETING',
      );
      assert.equal(await stored(doc.storageKey), 'retry delete bytes');
      await forceVisible(doc.id);
      await dispatcher().tick();
      await absent(doc.storageKey);
      assert.equal(await prisma.document.count({ where: { id: doc.id } }), 0);
      assert.equal((await service.deleteDocument(doc.id, workspace.id)).ok, true);
      assert.ok(await prisma.flashcardSet.findUnique({ where: { id: existingSet.id } }));
      assert.equal(
        (await prisma.flashcardSet.findUniqueOrThrow({ where: { id: existingSet.id } }))
          .sourceDocumentId,
        null,
      );
      const missing = await created('already missing');
      await s3.send(
        new sdk.DeleteObjectCommand({
          Bucket: infra.environment.S3_BUCKET,
          Key: missing.storageKey,
        }),
      );
      await service.deleteDocument(missing.id, workspace.id);
      await dispatcher().tick();
      assert.equal(await prisma.document.count({ where: { id: missing.id } }), 0);
      return { retriesRecovered: true, artifactsRetained: true, repeatedDeleteAccepted: true };
    },
  );
  await scenario(
    'S3 deletion success then DB finalization failure remains tombstoned and recovers',
    async () => {
      const doc = await created('delete commit failure');
      await service.deleteDocument(doc.id, workspace.id);
      let fail = true;
      const broken = overridden(prisma, {
        $transaction: async (callback) => {
          if (fail) {
            fail = false;
            throw new Error('Injected cleanup DB finalization outage');
          }
          return prisma.$transaction(callback);
        },
      });
      await dispatcher({ db: broken }).tick();
      await absent(doc.storageKey);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).lifecycle,
        'DELETING',
      );
      assert.notEqual(
        (
          await prisma.documentTask.findUniqueOrThrow({
            where: { id: lifecycleModule.deleteTaskId(doc.id) },
          })
        ).status,
        'DONE',
      );
      await forceVisible(doc.id);
      await dispatcher().tick();
      assert.equal(await prisma.document.count({ where: { id: doc.id } }), 0);
      return { liveRowWithoutFile: false, retryRecovered: true };
    },
  );
  await scenario(
    'delete racing in-flight parser blocks publication and resurrected READY state',
    async () => {
      const doc = await created('parser race result');
      const started = deferred(),
        resume = deferred();
      const racing = createDocumentProcessor({
        db: prisma,
        getObject: async (key, signal) => {
          const body = await workerS3.getFromS3(key, signal);
          started.resolve();
          await resume.promise;
          return body;
        },
        parsePdf: async () => '',
        timeoutMs: 5000,
      });
      const execution = racing(doc.id);
      await started.promise;
      await service.deleteDocument(doc.id, workspace.id);
      resume.resolve();
      await execution;
      const tombstone = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      assert.equal(tombstone.lifecycle, 'DELETING');
      assert.notEqual(tombstone.processingStatus, 'COMPLETED');
      assert.equal(tombstone.parsedText, null);
      await dispatcher().tick();
      return { publicationFenced: true };
    },
  );
  await scenario(
    'DB scope rejects stale/foreign AI payloads and delete races with synthetic provider publication',
    async () => {
      const doc = await created('AI scope guard text');
      await parser(doc.id);
      let calls = 0,
        complete;
      const ai = {
        getAIProvider: () => ({
          completeJSON: async () => {
            calls++;
            return complete();
          },
        }),
        SUMMARY_SYSTEM_PROMPT: 'synthetic',
        FLASHCARD_SYSTEM_PROMPT: 'synthetic',
        buildSummaryUserPrompt: (text) => text,
        buildFlashcardUserPrompt: (text) => text,
        buildFlashcardFromSummaryPrompt: JSON.stringify,
        parseSummaryOutput: (data) => data,
        parseFlashcardOutput: (data) => data,
      };
      const processors = buildLoader({ '@campusforge/ai': ai });
      const summary = processors.load('apps/worker/src/jobs/generate-summary.ts');
      const cards = processors.load('apps/worker/src/jobs/generate-flashcards.ts');
      const foreign = { documentId: doc.id, workspaceId: 'foreign-workspace', userId: user.id };
      await summary.processSummaryJob(foreign);
      await cards.processFlashcardJob(foreign);
      assert.equal(calls, 0);
      const started = deferred(),
        resume = deferred();
      complete = async () => {
        started.resolve();
        await resume.promise;
        return {
          data: {
            title: 'Race result',
            tldr: 'synthetic',
            sections: [],
            keyTerms: [],
            cards: [{ front: 'Q', back: 'A' }],
          },
          meta: { totalTokens: 0, estimatedCost: 0, latencyMs: 0 },
        };
      };
      const execution = cards.processFlashcardJob({
        documentId: doc.id,
        workspaceId: workspace.id,
        userId: user.id,
      });
      await started.promise;
      await service.deleteDocument(doc.id, workspace.id);
      resume.resolve();
      await assert.rejects(execution);
      assert.equal(await prisma.flashcardSet.count({ where: { sourceDocumentId: doc.id } }), 0);
      await summary.processSummaryJob({
        documentId: doc.id,
        workspaceId: workspace.id,
        userId: user.id,
      });
      assert.equal(calls, 1);
      await dispatcher().tick();
      return { providerCalls: 1, paidCalls: 0, publicationFenced: true };
    },
  );
  await scenario(
    'real worker OS process restart recovers prepared stale lease and ignores replay',
    async () => {
      for (const pkg of ['db', 'shared', 'ai']) {
        const compiled = spawnSync(
          process.execPath,
          [
            requireWeb.resolve('typescript/lib/tsc.js'),
            '-p',
            resolve(root, `packages/${pkg}/tsconfig.build.json`),
          ],
          {
            cwd: root,
            env: syntheticChildEnv(infra.environment),
            encoding: 'utf8',
            timeout: 30_000,
          },
        );
        assert.equal(
          compiled.status,
          0,
          `Compile ${pkg} for actual source worker process: ${compiled.stdout}${compiled.stderr}`,
        );
      }
      const workerLogs = [];
      const start = () => {
        workerProcess = spawn(
          process.execPath,
          [
            '--import',
            pathToFileURL(requireWeb.resolve('tsx')).href,
            resolve(root, 'apps/worker/src/index.ts'),
          ],
          {
            cwd: root,
            env: syntheticChildEnv({
              ...infra.environment,
              OPENAI_API_KEY: 'synthetic-no-provider-called',
              OPENAI_MODEL: 'gpt-4o-mini',
            }),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        workerProcess.stdout.on('data', (data) => workerLogs.push(data.toString()));
        workerProcess.stderr.on('data', (data) => workerLogs.push(data.toString()));
        workerProcess.on('error', (error) => workerLogs.push(error.message));
      };
      const waitFor = async (id, status) => {
        for (let attempt = 0; attempt < 150; attempt++) {
          if (workerProcess.exitCode !== null)
            throw new Error(`Actual worker exited early: ${workerLogs.join('')}`);
          const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
          if (doc.processingStatus === status) return doc;
          await delay(100);
        }
        throw new Error(`Actual worker completion deadline exceeded: ${workerLogs.join('')}`);
      };
      const first = await created('worker process first incarnation');
      start();
      await waitFor(first.id, 'COMPLETED');
      await stopWorkerProcess();
      const stale = await created('restart recovers prepared stale lease');
      await prisma.document.update({
        where: { id: stale.id },
        data: {
          processingStatus: 'PROCESSING',
          parseLeaseToken: randomUUID(),
          parseLeaseUntil: new Date(0),
          parseAttempts: 1,
        },
      });
      const exhausted = await created('last crashed attempt');
      await prisma.document.update({
        where: { id: exhausted.id },
        data: {
          processingStatus: 'PROCESSING',
          parseLeaseToken: randomUUID(),
          parseLeaseUntil: new Date(0),
          parseAttempts: 5,
        },
      });
      start();
      await dispatchDocumentParse(first.id, lifecycleModule.parseTaskId(first.id));
      await waitFor(stale.id, 'COMPLETED');
      await waitFor(exhausted.id, 'FAILED');
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: first.id } })).parseAttempts,
        1,
      );
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: stale.id } })).parseAttempts,
        2,
      );
      assert.equal(
        (
          await prisma.documentTask.findUniqueOrThrow({
            where: { id: lifecycleModule.parseTaskId(exhausted.id) },
          })
        ).status,
        'DONE',
      );
      await stopWorkerProcess();
      writeFileSync(resolve(evidence, 'integration-worker-process.log'), workerLogs.join(''));
      return {
        incarnations: 2,
        preparedExpiredLease: true,
        osProcessRestart: true,
        killedDuringExactS3CrashWindow: false,
        replayAttempts: 1,
        exhaustedCrashBudget: 'FAILED',
      };
    },
  );
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await stopWorkerProcess();
  await Promise.allSettled(resources.map((resource) => resource.close()));
  await queue?.close().catch(() => {});
  redis?.disconnect(false);
  await prisma?.$disconnect();
  s3?.destroy();
  await migrationStage?.clean();
  let cleaned = false;
  try {
    if (infra) {
      await infra.clean();
      cleaned = true;
    }
  } catch (error) {
    console.error(`Run-scoped cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
  writeFileSync(
    resolve(evidence, 'integration-results.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        node: process.version,
        infrastructure: infra
          ? {
              runId: infra.id,
              containerNames: infra.names,
              ports: infra.ports,
              disposable: true,
              cleaned,
            }
          : null,
        scope:
          'Actual application source with real isolated PostgreSQL/Redis/MinIO; declared failure boundaries injected; synthetic AI only',
        paidAIRequests: 0,
        results,
      },
      null,
      2,
    ) + '\n',
  );
}
