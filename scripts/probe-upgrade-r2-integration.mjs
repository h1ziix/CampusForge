// R2 real infrastructure acceptance. No .env, user database, or external AI request.
// The application route, admission, dispatcher, worker and queries are loaded from source.
// Authentication is synthetic; the actual AIProvider receives an in-memory test transport.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  isolatedInfrastructure,
  stagedPrismaMigrations,
  syntheticChildEnv,
} from '../tests/fixtures/r4-infrastructure.mjs';
import { applicationLoader, root } from '../tests/fixtures/r3-source-loader.mjs';

const evidence = resolve(root, 'docs/upgrade-2026-10-08/R2-evidence');
mkdirSync(evidence, { recursive: true });
const requireDB = createRequire(resolve(root, 'packages/db/package.json'));
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const requireWorker = createRequire(resolve(root, 'apps/worker/package.json'));
const requireAI = createRequire(resolve(root, 'packages/ai/package.json'));
const sdk = requireWeb('@aws-sdk/client-s3');
const { Queue, Worker } = requireWorker('bullmq');
const Redis = requireWorker('ioredis');
const results = [];
const workers = [];
const queues = [];
const workerErrors = [];
const transportRequests = [];
let infra, migrationStage, prisma, redis, s3;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const save = () =>
  writeFileSync(
    resolve(evidence, 'integration-results.json'),
    JSON.stringify(
      {
        date: '2026-10-08',
        timezone: 'Asia/Qyzylorda',
        node: process.version,
        runId: infra?.id,
        containers: infra?.names,
        boundary:
          'Fresh run-labelled tmpfs PostgreSQL16/Redis7/MinIO; actual application route/actions/queries, Prisma transactions, S3 and BullMQ dispatcher/worker; synthetic auth and in-memory AI HTTP transport; paid provider calls 0',
        realProvider: {
          status: 'NOT_RUN',
          reason: 'Dedicated test project, verified spend cap and permitted corpus not supplied.',
        },
        providerRequests: transportRequests.length,
        workerErrors,
        results,
      },
      null,
      2,
    ) + '\n',
  );
async function scenario(name, operation) {
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
    save();
  } catch (error) {
    results.push({
      name,
      passed: false,
      elapsedMs: Math.round(performance.now() - started),
      error: error.message,
    });
    save();
    throw error;
  }
}
async function until(predicate, label, dispatcher, timeoutMs = 15_000) {
  const expires = Date.now() + timeoutMs;
  while (Date.now() < expires) {
    if (await predicate()) return;
    await dispatcher.tick();
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  assert.match(process.version, /^v24\./, 'Use pnpm --use-node-version=24.21.0 exec node');
  // Reuse the release fixture's strict per-run ownership checks and finally cleanup.
  infra = await isolatedInfrastructure();
  migrationStage = await stagedPrismaMigrations();
  await scenario('fresh disposable migrations; repository .env never loaded', async () => {
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
        windowsHide: true,
        timeout: 60_000,
      },
    );
    writeFileSync(
      resolve(evidence, 'integration-migration.log'),
      migration.stdout + migration.stderr,
    );
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    assert.doesNotMatch(migration.stdout + migration.stderr, /Environment variables loaded from/);
    return { repositoryEnvironmentLoaded: false };
  });
  const { PrismaClient, Prisma } = requireDB(resolve(root, 'packages/db/generated/client'));
  const connect = () =>
    new PrismaClient({
      datasources: { db: { url: `${infra.environment.DATABASE_URL}?connection_limit=20` } },
    });
  prisma = connect();
  s3 = new sdk.S3Client({
    endpoint: infra.environment.S3_ENDPOINT,
    region: infra.environment.S3_REGION,
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
  const user = await prisma.user.create({
    data: { email: `upgrade-r2-${infra.id}@example.invalid` },
  });
  const workspace = await prisma.workspace.create({
    data: { name: 'R2 disposable', type: 'PERSONAL', ownerId: user.id },
  });
  await prisma.membership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
  });
  const foreignUser = await prisma.user.create({
    data: { email: `upgrade-r2-outsider-${infra.id}@example.invalid` },
  });
  const foreignWorkspace = await prisma.workspace.create({
    data: { name: 'R2 foreign', type: 'PERSONAL', ownerId: foreignUser.id },
  });
  const documentModule = applicationLoader({ './client': { prisma } }).load(
    'packages/db/src/document-lifecycle.ts',
  );
  const aiModule = applicationLoader({ './client': { prisma } }).load(
    'packages/db/src/ai-lifecycle.ts',
  );
  const db = {
    prisma,
    Prisma,
    ...documentModule,
    ...documentModule.createDocumentLifecycle(prisma),
    ...aiModule,
    ...aiModule.createAIOperationLifecycle(prisma),
  };
  const environment = {
    ...infra.environment,
    AUTH_URL: 'https://r2.example.invalid',
    OPENAI_MODEL: 'gpt-4o-mini',
    AI_WORKSPACE_CONCURRENCY: '20',
  };
  const shared = applicationLoader({}, environment).load('packages/shared/src/index.ts');
  const ai = applicationLoader({ openai: requireAI('openai') }).load('packages/ai/src/index.ts');
  const transport = new ai.AIProvider({
    apiKey: 'upgrade-r2-test-key-never-sent',
    model: environment.OPENAI_MODEL,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      const userPrompt = body.messages.find((message) => message.role === 'user').content;
      const source = userPrompt.split('--- DOCUMENT TEXT ---\n')[1];
      assert.equal(typeof source, 'string', 'Actual complete immutable source must reach provider');
      const kind = body.messages[0].content.includes('flashcard') ? 'FLASHCARD' : 'SUMMARY';
      transportRequests.push({
        kind,
        sourceHash: hash(source),
        sourceBytes: Buffer.byteLength(source),
      });
      if (source.includes('R2_KNOWN_FAILURE'))
        return new Response(
          JSON.stringify({
            error: { message: 'Synthetic known rejection', type: 'invalid_request_error' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      if (source.includes('R2_UNKNOWN_OUTCOME'))
        throw new TypeError('Synthetic ambiguous network outcome');
      // This adapter only proves content transport/persistence, not model quality.
      const subject = source.split(/[\s\n]/)[0];
      const output =
        kind === 'SUMMARY'
          ? {
              title: `Recall ${subject}`,
              tldr: source,
              sections: [{ heading: `Source ${subject}`, content: source }],
              keyTerms: [subject],
            }
          : {
              title: `Recall ${subject}`,
              cards: [{ front: `What does ${subject} explain?`, back: source }],
            };
      return new Response(
        JSON.stringify({
          id: 'upgrade-r2-test-completion',
          model: 'gpt-4o-mini-2024-07-18',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: JSON.stringify(output) },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': `r2_${randomUUID()}` },
        },
      );
    },
  });
  const dependencies = {
    '@campusforge/db': db,
    '@campusforge/shared': shared,
    '@campusforge/ai': { ...ai, getAIProvider: () => transport },
    '@aws-sdk/client-s3': sdk,
    '../lib/pdf': {
      extractPdfText: async () => {
        throw new Error('This acceptance corpus is UTF-8, not PDF/OCR.');
      },
    },
    '@/lib/auth': { auth: async () => ({ user: { id: user.id } }) },
    '@/server/services/auth-helpers': {
      requireAuth: async () => user,
      requireWorkspaceMember: async (userId, workspaceId) => {
        assert.ok(
          await prisma.membership.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
          }),
          'Workspace membership required',
        );
      },
    },
  };
  const loader = applicationLoader(dependencies, environment);
  const route = loader.load(
    'apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts',
  );
  const summaryAction = loader.load('apps/web/src/server/actions/summary.ts').generateSummaryAction;
  const cardsAction = loader.load(
    'apps/web/src/server/actions/flashcard.ts',
  ).generateFlashcardsAction;
  const stateAction = loader.load(
    'apps/web/src/server/actions/document.ts',
  ).getDocumentGenerationStateAction;
  const workerS3 = loader.load('apps/worker/src/lib/s3.ts');
  const queueDispatch = loader.load('apps/worker/src/lib/dispatch-queue.ts');
  const parser = loader.load('apps/worker/src/jobs/parse-document.ts').createDocumentProcessor({
    db: prisma,
    getObject: workerS3.getFromS3,
    parsePdf: async () => '',
    timeoutMs: 5000,
  });
  const aiProcessor = loader
    .load('apps/worker/src/jobs/ai-operation.ts')
    .createAIOperationProcessor({ db: prisma, provider: transport });
  const dispatcher = loader
    .load('apps/worker/src/lifecycle/dispatcher.ts')
    .createDocumentDispatcher({
      db: prisma,
      enqueueParse: queueDispatch.dispatchDocumentParse,
      enqueueAI: queueDispatch.dispatchAIOperation,
      deleteObject: workerS3.deleteFromS3,
      deleteUploadObject: workerS3.deleteUploadFromS3,
      batchSize: 50,
      visibilityMs: 1000,
    });
  for (const [name, processor] of [
    ['document-processing', (job) => parser(job.data.documentId)],
    ['ai-pipeline', (job) => aiProcessor(job.data.operationId)],
  ]) {
    const queue = new Queue(name, { connection: redis });
    queue.on('error', () => {});
    queues.push(queue);
    const worker = new Worker(name, processor, { connection: redis, concurrency: 4 });
    worker.on('error', (error) =>
      workerErrors.push({ type: 'worker', name, error: error.message }),
    );
    worker.on('failed', (_job, error) =>
      workerErrors.push({ type: 'job', name, error: error.message }),
    );
    workers.push(worker);
    await worker.waitUntilReady();
  }
  const upload = async (text, options = {}) => {
    const form = new FormData();
    form.set(
      'file',
      new File([text], options.filename ?? 'lecture.txt', { type: options.type ?? 'text/plain' }),
    );
    const response = await route.POST(
      new Request('https://r2.example.invalid/api/upload', {
        method: 'POST',
        headers: { origin: 'https://r2.example.invalid' },
        body: form,
      }),
      { params: Promise.resolve({ workspaceId: workspace.id }) },
    );
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.processingStatus, 'PENDING');
    const document = await prisma.document.findUniqueOrThrow({ where: { id: result.documentId } });
    const object = await s3.send(
      new sdk.GetObjectCommand({ Bucket: infra.environment.S3_BUCKET, Key: document.storageKey }),
    );
    assert.equal(await object.Body.transformToString(), text);
    await until(
      async () =>
        (await prisma.document.findUniqueOrThrow({ where: { id: document.id } }))
          .processingStatus === 'COMPLETED',
      'parse worker',
      dispatcher,
    );
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    assert.equal(parsed.parsedText, text);
    return parsed;
  };
  const formFor = (document, idempotencyKey) => {
    const form = new FormData();
    form.set('workspaceId', workspace.id);
    form.set('documentId', document.id);
    form.set('idempotencyKey', idempotencyKey);
    return form;
  };
  const generate = async (document, kind, key = randomUUID(), clicks = 1) => {
    const action = kind === 'SUMMARY' ? summaryAction : cardsAction;
    const admissions = await Promise.all(
      Array.from({ length: clicks }, () => action(formFor(document, key))),
    );
    assert.ok(
      admissions.every((admission) => admission.success),
      JSON.stringify(admissions),
    );
    const operationId = admissions[0].data.operationId;
    assert.ok(admissions.every((admission) => admission.data.operationId === operationId));
    assert.equal(
      await prisma.aIJob.count({
        where: { documentId: document.id, type: kind, idempotencyKey: key },
      }),
      1,
    );
    assert.equal(await prisma.documentTask.count({ where: { operationId, kind: 'AI' } }), 1);
    await until(
      async () =>
        ['COMPLETED', 'FAILED', 'UNCERTAIN', 'CANCELLED'].includes(
          (await prisma.aIJob.findUniqueOrThrow({ where: { id: operationId } })).status,
        ),
      'AI worker',
      dispatcher,
    );
    return prisma.aIJob.findUniqueOrThrow({ where: { id: operationId } });
  };
  const biologyText =
    'BOTANY Chlorophyll absorbs light in chloroplasts. Photosynthesis converts water and carbon dioxide into sugars. END_BOTANY_17';
  const physicsText =
    'PHYSICS Gravity attracts masses. Orbital motion results from gravity and tangential velocity. END_PHYSICS_29';
  let biology, physics, biologySummary, biologyCards, physicsSummary, physicsCards;
  await scenario(
    'actual upload → MinIO → durable parse task → Redis worker → complete text in PostgreSQL',
    async () => {
      biology = await upload(biologyText);
      physics = await upload(physicsText);
      return {
        documents: 2,
        sourceHashes: [hash(biologyText), hash(physicsText)],
        parseStates: [biology.processingStatus, physics.processingStatus],
        sourceBytesPreserved: true,
      };
    },
  );
  await scenario(
    'two sources with the same filename receive their own summary/cards; 20 duplicate clicks create one logical operation',
    async () => {
      biologySummary = await generate(biology, 'SUMMARY', randomUUID(), 20);
      biologyCards = await generate(biology, 'FLASHCARD', randomUUID(), 20);
      physicsSummary = await generate(physics, 'SUMMARY');
      physicsCards = await generate(physics, 'FLASHCARD');
      for (const operation of [biologySummary, biologyCards, physicsSummary, physicsCards]) {
        assert.equal(operation.status, 'COMPLETED');
        assert.equal(await prisma.aIAttempt.count({ where: { operationId: operation.id } }), 1);
      }
      assert.equal(transportRequests.length, 4);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: biology.id } })).summaryJson.tldr,
        biologyText,
      );
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: physics.id } })).summaryJson.tldr,
        physicsText,
      );
      for (const [operation, text] of [
        [biologyCards, biologyText],
        [physicsCards, physicsText],
      ]) {
        const set = await prisma.flashcardSet.findUniqueOrThrow({
          where: { operationId: operation.id },
        });
        assert.equal(set.cardsJson[0].back, text);
      }
      return {
        parallelClicksPerBiologyAction: 20,
        logicalOperations: 4,
        providerRequests: 4,
        attempts: 4,
        inputPreservedThroughProvider: true,
        qualityBoundary:
          'Deterministic test adapter echoes full source; this does not evaluate a real model.',
      };
    },
  );
  await scenario(
    'same key request after completion and queue redelivery reuse persisted results without another AI call',
    async () => {
      const before = transportRequests.length;
      const replay = await summaryAction(formFor(biology, biologySummary.idempotencyKey));
      assert.equal(replay.success, true);
      assert.equal(replay.data.operationId, biologySummary.id);
      assert.equal(replay.data.status, 'COMPLETED');
      await aiProcessor(biologySummary.id);
      await aiProcessor(biologyCards.id);
      assert.equal(transportRequests.length, before);
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: biologyCards.id } }), 1);
      return { additionalProviderRequests: 0, flashcardArtifacts: 1 };
    },
  );
  await scenario(
    'new database connection/reopen queries show saved summary, jobs and the real Study set without source/storage payloads',
    async () => {
      const reopened = connect();
      try {
        const queries = applicationLoader(
          {
            '@campusforge/db': { ...db, prisma: reopened },
            '@campusforge/shared': shared,
            '@campusforge/ai': ai,
          },
          environment,
        );
        const document = await queries
          .load('apps/web/src/server/queries/document.ts')
          .getDocumentById(biology.id, workspace.id);
        assert.equal(Object.hasOwn(document, 'parsedText'), false);
        assert.equal(Object.hasOwn(document, 'storageKey'), false);
        const summaryQueries = queries.load('apps/web/src/server/queries/summary.ts');
        const summary = await summaryQueries.getDocumentSummary(biology.id, workspace.id);
        assert.equal(summary.tldr, biologyText);
        const job = await summaryQueries.getLatestAIJob(biology.id, 'SUMMARY', workspace.id);
        assert.equal(job.status, 'COMPLETED');
        const flashcardQueries = queries.load('apps/web/src/server/queries/flashcard.ts');
        const sets = await flashcardQueries.getFlashcardSetsForDocument(biology.id, workspace.id);
        assert.equal(sets.length, 1);
        const set = await flashcardQueries.getFlashcardSetById(sets[0].id, workspace.id);
        assert.equal(set.cards[0].back, biologyText);
        assert.equal(await flashcardQueries.getFlashcardSetById(set.id, foreignWorkspace.id), null);
        assert.equal(
          await summaryQueries.getLatestAIJob(biology.id, 'SUMMARY', foreignWorkspace.id),
          null,
        );
        assert.equal(
          await queries
            .load('apps/web/src/server/queries/document.ts')
            .getDocumentById(biology.id, foreignWorkspace.id),
          null,
        );
        const aggregate = await queries
          .load('apps/web/src/server/queries/document-state.ts')
          .getDocumentGenerationState(biology.id, workspace.id);
        assert.equal(aggregate.summary.tldr, biologyText);
        assert.equal(aggregate.summaryJob.id, biologySummary.id);
        assert.equal(aggregate.flashcardSets[0].id, set.id);
        assert.equal(aggregate.flashcardJob.id, biologyCards.id);
        return {
          reopenedUsingIndependentDatabaseConnection: true,
          summaryPersisted: true,
          operationStatus: job.status,
          studySetId: set.id,
          studyCards: set.cards.length,
          sourceAndStorageInternalsInPayload: false,
          foreignWorkspaceDenied: true,
        };
      } finally {
        await reopened.$disconnect();
      }
    },
  );
  await scenario(
    'empty browser MIME Markdown is normalized by server policy and parsed without weakening binary rejection',
    async () => {
      const text = '# MARKDOWN\nA markdown file without a browser MIME remains UTF-8 text.';
      const doc = await upload(text, { filename: 'lecture.md', type: '' });
      assert.equal(doc.mimeType, 'text/markdown');
      assert.equal(doc.parsedText, text);
      const count = await prisma.document.count();
      const form = new FormData();
      form.set('file', new File([new Uint8Array([0, 1, 2, 3])], 'binary.md', { type: '' }));
      const response = await route.POST(
        new Request('https://r2.example.invalid/api/upload', {
          method: 'POST',
          headers: { origin: 'https://r2.example.invalid' },
          body: form,
        }),
        { params: Promise.resolve({ workspaceId: workspace.id }) },
      );
      assert.equal(response.status, 415);
      assert.equal(await prisma.document.count(), count);
      return { normalizedMimeType: doc.mimeType, binaryStatus: response.status };
    },
  );
  await scenario(
    'configured input budget rejects the entire oversized source before operation, reservation or provider request',
    async () => {
      const policy = shared.readAIEnvironmentPolicy();
      const doc = await upload('OVERSIZED ' + 'Ж'.repeat(policy.parameters.maxInputTokens));
      const before = {
        jobs: await prisma.aIJob.count(),
        tasks: await prisma.documentTask.count({ where: { kind: 'AI' } }),
        requests: transportRequests.length,
        budget: await prisma.aIWorkspaceBudget.findUnique({ where: { workspaceId: workspace.id } }),
      };
      const denied = await summaryAction(formFor(doc, randomUUID()));
      assert.equal(denied.success, false);
      assert.match(denied.error, /input budget/i);
      assert.equal(await prisma.aIJob.count(), before.jobs);
      assert.equal(await prisma.documentTask.count({ where: { kind: 'AI' } }), before.tasks);
      assert.equal(transportRequests.length, before.requests);
      const afterBudget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: workspace.id },
      });
      assert.equal(afterBudget.reservedMicros, before.budget.reservedMicros);
      assert.equal(afterBudget.usedMicros, before.budget.usedMicros);
      const detail = await loader
        .load('apps/web/src/server/queries/document.ts')
        .getDocumentById(doc.id, workspace.id);
      assert.equal(detail.aiInput.maxInputTokens, policy.parameters.maxInputTokens);
      assert.equal(detail.aiInput.summary.eligible, false);
      assert.ok(detail.aiInput.summary.estimatedInputTokens > policy.parameters.maxInputTokens);
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).parsedText,
        doc.parsedText,
      );
      return {
        maxInputTokens: policy.parameters.maxInputTokens,
        sourceBytes: Buffer.byteLength(doc.parsedText),
        estimatedInputTokens: detail.aiInput.summary.estimatedInputTokens,
        silentlyTruncated: false,
        newOperations: 0,
        newReservations: 0,
        newProviderRequests: 0,
      };
    },
  );
  await scenario(
    'known failure remains FAILED without success artifacts; same key cannot manufacture another operation',
    async () => {
      const doc = await upload(
        'R2_KNOWN_FAILURE This synthetic source exercises a provider rejection.',
      );
      const key = randomUUID();
      const operation = await generate(doc, 'SUMMARY', key);
      assert.equal(operation.status, 'FAILED');
      assert.equal(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).summaryJson,
        null,
      );
      const before = transportRequests.length;
      const retry = await summaryAction(formFor(doc, key));
      assert.equal(retry.data.operationId, operation.id);
      assert.equal(retry.data.status, 'FAILED');
      await aiProcessor(operation.id);
      assert.equal(transportRequests.length, before);
      return { state: operation.status, artifacts: 0, replayProviderRequests: 0 };
    },
  );
  await scenario(
    'ambiguous provider result remains UNCERTAIN through dispatcher, status checks and same-key replay without a paid retry',
    async () => {
      const doc = await upload(
        'R2_UNKNOWN_OUTCOME This synthetic source exercises an ambiguous network outcome.',
      );
      const key = randomUUID();
      const operation = await generate(doc, 'FLASHCARD', key);
      assert.equal(operation.status, 'UNCERTAIN');
      const before = transportRequests.length;
      for (let index = 0; index < 3; index++) {
        await dispatcher.tick();
        await aiProcessor(operation.id);
        const retry = await cardsAction(formFor(doc, key));
        assert.equal(retry.data.operationId, operation.id);
        assert.equal(retry.data.status, 'UNCERTAIN');
        const checked = await stateAction(formFor(doc, key));
        assert.equal(checked.success, true);
        assert.equal(checked.data.flashcardJob.status, 'UNCERTAIN');
        assert.equal(checked.data.flashcardJob.idempotencyKey, key);
        assert.match(checked.data.flashcardJob.errorMessage, /unknown/i);
        assert.doesNotMatch(
          JSON.stringify(checked.data),
          /R2_UNKNOWN_OUTCOME|inputJson|storageKey|parsedText|documents\//,
        );
      }
      assert.equal(transportRequests.length, before);
      assert.equal(await prisma.aIAttempt.count({ where: { operationId: operation.id } }), 1);
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 0);
      const budget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: workspace.id },
      });
      assert.ok(budget.reservedMicros >= operation.reservedMicros);
      return {
        state: operation.status,
        attempts: 1,
        replayProviderRequests: 0,
        artifacts: 0,
        uncertainReservationRetained: true,
        authenticatedReadOnlyStatusChecks: 3,
      };
    },
  );
  assert.equal(workerErrors.length, 0, JSON.stringify(workerErrors));
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await Promise.all(workers.map((worker) => worker.close().catch(() => {})));
  await Promise.all(queues.map((queue) => queue.close().catch(() => {})));
  redis?.disconnect();
  s3?.destroy();
  await prisma?.$disconnect();
  await infra?.clean();
  await migrationStage?.clean();
  save();
}
