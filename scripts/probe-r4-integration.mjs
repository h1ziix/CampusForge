// Actual application entrances and lifecycle modules against disposable PG/Redis.
// Authentication and provider transport are explicitly synthetic. No .env is read.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  isolatedInfrastructure,
  stagedPrismaMigrations,
  syntheticChildEnv,
} from '../tests/fixtures/r4-infrastructure.mjs';
import { applicationLoader, deferred, root } from '../tests/fixtures/r3-source-loader.mjs';

const requireDB = createRequire(resolve(root, 'packages/db/package.json'));
const requireWorker = createRequire(resolve(root, 'apps/worker/package.json'));
const requireAI = createRequire(resolve(root, 'packages/ai/package.json'));
const { Queue, Worker } = requireWorker('bullmq');
const Redis = requireWorker('ioredis');
const evidence = resolve(root, 'docs/releases/R4-evidence');
mkdirSync(evidence, { recursive: true });
const results = [];
let infra, migrationStage, prisma, redis, queue;
const workers = [];
const children = [];
const extraQueues = [];
const overridden = (db, overrides) =>
  new Proxy(db, {
    get(target, name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
const save = () =>
  writeFileSync(
    resolve(evidence, 'integration-results.json'),
    JSON.stringify(
      {
        date: '2026-10-08',
        timezone: 'Asia/Qyzylorda',
        node: process.version,
        boundary:
          'Fresh run-labelled tmpfs PG16/Redis7/MinIO; actual Prisma transactions, BullMQ, application actions/lifecycle/worker; auth session and AI transport synthetic; paid calls 0',
        runId: infra?.id,
        containers: infra?.names,
        results,
      },
      null,
      2,
    ) + '\n',
  );
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
};
async function waitFor(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(`${label} exceeded ${timeoutMs}ms`);
}

try {
  assert.match(process.version, /^v24\./);
  infra = await isolatedInfrastructure();
  migrationStage = await stagedPrismaMigrations();
  await scenario('fresh disposable migration; repository .env never loaded', async () => {
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
        windowsHide: true,
      },
    );
    writeFileSync(
      resolve(evidence, 'integration-migration.log'),
      migration.stdout + migration.stderr,
    );
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    assert.doesNotMatch(migration.stdout + migration.stderr, /Environment variables loaded from/);
    return { boundary: 'Fresh PostgreSQL database; full immutable old migration chain plus R4' };
  });
  const { PrismaClient } = requireDB(resolve(root, 'packages/db/generated/client'));
  prisma = new PrismaClient({
    datasources: { db: { url: `${infra.environment.DATABASE_URL}?connection_limit=30` } },
  });
  redis = new Redis(infra.environment.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on('error', () => {});
  queue = new Queue('ai-pipeline', { connection: redis });
  queue.on('error', () => {});
  await queue.waitUntilReady();
  const user = await prisma.user.create({ data: { email: `r4-${infra.id}@example.invalid` } });
  const workspace = await prisma.workspace.create({
    data: { name: 'R4 disposable', type: 'PERSONAL', ownerId: user.id },
  });
  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
  });
  const outsider = await prisma.user.create({
    data: { email: `r4-outsider-${infra.id}@example.invalid` },
  });
  const otherWorkspace = await prisma.workspace.create({
    data: { name: 'R4 other tenant', type: 'PERSONAL', ownerId: outsider.id },
  });
  await prisma.membership.create({
    data: { userId: outsider.id, workspaceId: otherWorkspace.id, role: 'OWNER' },
  });
  const module = applicationLoader({ './client': { prisma } }).load(
    'packages/db/src/ai-lifecycle.ts',
  );
  const documentModule = applicationLoader({ './client': { prisma } }).load(
    'packages/db/src/document-lifecycle.ts',
  );
  const lifecycle = module.createAIOperationLifecycle(prisma);
  const documentLifecycle = documentModule.createDocumentLifecycle(prisma);
  const dbExports = { prisma, ...module, ...documentModule, ...lifecycle, ...documentLifecycle };
  const environment = {
    ...infra.environment,
    OPENAI_MODEL: 'gpt-4o-mini',
    AI_WORKSPACE_CONCURRENCY: '30',
  };
  const shared = applicationLoader({}, environment).load('packages/shared/src/index.ts');
  const aiExports = applicationLoader({ openai: requireAI('openai') }).load(
    'packages/ai/src/index.ts',
  );
  const actionDependencies = {
    '@campusforge/db': dbExports,
    '@campusforge/shared': shared,
    '@campusforge/ai': aiExports,
    '@/server/services/auth-helpers': {
      requireAuth: async () => user,
      requireWorkspaceMember: async (userId, workspaceId) => {
        const membership = await prisma.membership.findUnique({
          where: { userId_workspaceId: { userId, workspaceId } },
        });
        if (!membership) throw new Error('Workspace membership required');
      },
    },
  };
  const actions = applicationLoader(actionDependencies, environment);
  const summaryAction = actions.load(
    'apps/web/src/server/actions/summary.ts',
  ).generateSummaryAction;
  const flashcardAction = actions.load(
    'apps/web/src/server/actions/flashcard.ts',
  ).generateFlashcardsAction;
  const parameters = {
    maxInputTokens: 8000,
    maxOutputTokens: 2048,
    temperature: 0.3,
    maxAttempts: 3,
    operationTimeoutMs: 120_000,
    requestTimeoutMs: 10_000,
    connectionTimeoutMs: 1000,
  };
  const document = async (workspaceId = workspace.id) =>
    prisma.document.create({
      data: {
        workspaceId,
        filename: 'synthetic.txt',
        mimeType: 'text/plain',
        sizeBytes: 50,
        storageKey: `documents/${workspaceId}/${randomUUID()}`,
        parsedText: 'The mitochondrion provides energy to cells through respiration.',
        processingStatus: 'COMPLETED',
      },
    });
  const request = async (doc, options = {}) =>
    lifecycle.requestAIOperation({
      userId: user.id,
      workspaceId: workspace.id,
      documentId: doc.id,
      type: 'SUMMARY',
      idempotencyKey: randomUUID(),
      model: 'gpt-4o-mini',
      parameters,
      reservationMicros: 5000,
      operationBudgetMicros: 10000,
      workspaceBudgetMicros: 1_000_000,
      workspaceConcurrency: 30,
      ...options,
    });
  const form = (doc, key = randomUUID(), workspaceId = workspace.id) => {
    const data = new FormData();
    data.set('workspaceId', workspaceId);
    data.set('documentId', doc.id);
    data.set('idempotencyKey', key);
    return data;
  };
  const summary = {
    title: 'Cell energy',
    tldr: 'Mitochondria release energy.',
    sections: [
      {
        heading: 'Respiration',
        content: 'Cells use respiration to release energy from nutrients.',
      },
    ],
    keyTerms: ['Mitochondrion'],
  };
  const cards = {
    title: 'Cell biology',
    cards: [
      {
        front: 'What provides cellular energy?',
        back: 'Mitochondria provide energy through respiration.',
      },
    ],
  };
  const provider = (output = summary, options = {}) => {
    const transport = new aiExports.AIProvider({
      apiKey: 'r4-synthetic-key-never-sent',
      model: 'gpt-4o-mini',
      fetch: async (_url, init) => {
        transport.calls++;
        await options.beforeResponse?.(init);
        if (options.error) throw options.error;
        if (options.status)
          return new Response(
            JSON.stringify({
              error: { message: 'Synthetic transport failure', code: 'synthetic' },
            }),
            { status: options.status, headers: { 'content-type': 'application/json' } },
          );
        return new Response(
          JSON.stringify({
            id: 'r4-synthetic-completion',
            model: options.model ?? 'gpt-4o-mini-2024-07-18',
            choices: [
              {
                index: 0,
                finish_reason: options.finishReason ?? 'stop',
                message: { role: 'assistant', content: options.content ?? JSON.stringify(output) },
              },
            ],
            ...(options.missingUsage
              ? {}
              : { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }),
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', 'x-request-id': `r4_${randomUUID()}` },
          },
        );
      },
    });
    transport.calls = 0;
    return transport;
  };
  const processor = (transport, options = {}) =>
    applicationLoader(
      {
        '@campusforge/db': dbExports,
        '@campusforge/shared': shared,
        '@campusforge/ai': {
          ...aiExports,
          getAIProvider: () => transport,
        },
      },
      environment,
    )
      .load('apps/worker/src/jobs/ai-operation.ts')
      .createAIOperationProcessor({ db: prisma, provider: transport, ...options });

  await scenario(
    'actual action: 20 parallel identical requests -> one operation/outbox/reservation',
    async () => {
      const doc = await document();
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => summaryAction(form(doc, key))),
      );
      assert.ok(
        results.every((result) => result.success),
        JSON.stringify(results),
      );
      const operations = await prisma.aIJob.findMany({ where: { documentId: doc.id } });
      assert.equal(operations.length, 1);
      assert.equal(
        await prisma.documentTask.count({ where: { operationId: operations[0].id, kind: 'AI' } }),
        1,
      );
      assert.ok(results.every((result) => result.data.operationId === operations[0].id));
      const budget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: workspace.id },
      });
      assert.equal(budget.activeOperations, 1);
      assert.equal(budget.reservedMicros, operations[0].reservedMicros);
      return {
        requests: 20,
        operations: 1,
        durableTasks: 1,
        operationId: operations[0].id,
        boundary:
          'Actual server action; real PostgreSQL constraints and transactions; session synthetic',
      };
    },
  );
  await scenario(
    'foreign workspace/document and nonmember create no operation or queue work',
    async () => {
      const doc = await document(otherWorkspace.id);
      const beforeOperations = await prisma.aIJob.count();
      const beforeTasks = await prisma.documentTask.count();
      assert.equal((await summaryAction(form(doc))).success, false);
      await assert.rejects(
        summaryAction(form(doc, randomUUID(), otherWorkspace.id)),
        /membership/i,
      );
      assert.equal(await prisma.aIJob.count(), beforeOperations);
      assert.equal(await prisma.documentTask.count(), beforeTasks);
      return {
        boundary: 'Actual entrance and real membership; no provider or Redis producer call',
      };
    },
  );
  await scenario(
    'same key with changed input rejected; new key explicitly regenerates',
    async () => {
      const doc = await document();
      const key = randomUUID();
      const first = await request(doc, { idempotencyKey: key });
      assert.equal((await request(doc, { idempotencyKey: key })).id, first.id);
      await prisma.document.update({
        where: { id: doc.id },
        data: { parsedText: 'Changed immutable request source version.' },
      });
      await assert.rejects(request(doc, { idempotencyKey: key }));
      const next = await request(doc);
      assert.notEqual(next.id, first.id);
      return { sameKeyOperationId: first.id, newKeyOperationId: next.id };
    },
  );
  await scenario(
    'actual admission rejects unknown model and prompt overhead before reservation',
    async () => {
      const doc = await document();
      const beforeOperations = await prisma.aIJob.count();
      const beforeTasks = await prisma.documentTask.count();
      const beforeBudget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: workspace.id },
      });
      const unknownEnvironment = { ...environment, OPENAI_MODEL: 'unknown-unapproved-model' };
      const unknownAction = applicationLoader(
        {
          ...actionDependencies,
          '@campusforge/shared': applicationLoader({}, unknownEnvironment).load(
            'packages/shared/src/index.ts',
          ),
        },
        unknownEnvironment,
      ).load('apps/web/src/server/actions/summary.ts').generateSummaryAction;
      const deniedModel = await unknownAction(form(doc));
      assert.equal(deniedModel.success, false);
      assert.match(deniedModel.error, /pricing policy/i);
      const tokenLimit = shared.readAIEnvironmentPolicy().parameters.maxInputTokens;
      await prisma.document.update({
        where: { id: doc.id },
        data: { parsedText: 'a'.repeat(tokenLimit - 10) },
      });
      const deniedOverhead = await summaryAction(form(doc));
      assert.equal(deniedOverhead.success, false);
      assert.match(deniedOverhead.error, /input budget/i);
      assert.equal(await prisma.aIJob.count(), beforeOperations);
      assert.equal(await prisma.documentTask.count(), beforeTasks);
      const afterBudget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: workspace.id },
      });
      assert.equal(afterBudget.reservedMicros, beforeBudget.reservedMicros);
      assert.equal(afterBudget.activeOperations, beforeBudget.activeOperations);
      return {
        unknownModelOperations: 0,
        belowRawByteLimitButOverPromptBudgetRejected: true,
        newReservations: 0,
      };
    },
  );
  await scenario(
    'expired pending operation reaches terminal state without provider calls',
    async () => {
      const doc = await document();
      const operation = await request(doc);
      await prisma.aIJob.update({ where: { id: operation.id }, data: { deadlineAt: new Date(0) } });
      const transport = provider();
      await processor(transport)(operation.id);
      assert.equal(transport.calls, 0);
      const after = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.equal(after.status, 'FAILED');
      assert.equal(after.budgetReleased, true);
      assert.equal(
        (await prisma.documentTask.findUnique({ where: { operationId: operation.id } })).status,
        'DONE',
      );
      return {
        providerCalls: 0,
        operationStatus: after.status,
        durableTaskStatus: 'DONE',
        reservationReleased: true,
      };
    },
  );
  await scenario(
    'physical delete and completion share lock order and never publish after tombstone',
    async () => {
      const doc = await document();
      const operation = await request(doc, { type: 'FLASHCARD' });
      const owned = await lifecycle.claimOperation(operation.id);
      const attempt = await lifecycle.beginAttempt(operation.id, owned.leaseToken);
      await lifecycle.recordResponse(attempt.id, {
        model: 'gpt-4o-mini-2024-07-18',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        usageStatus: 'RECEIVED',
        estimatedCost: 0.000045,
        pricingVersion: aiExports.PRICING_VERSION,
        requestId: 'r4_physical_delete',
        latencyMs: 5,
      });
      await documentLifecycle.requestDocumentDeletion(doc.id, workspace.id);
      const deleteDb = overridden(prisma, {
        documentTask: overridden(prisma.documentTask, {
          findFirst: (args) =>
            prisma.documentTask.findFirst({
              ...args,
              where: { ...args.where, id: documentModule.deleteTaskId(doc.id) },
            }),
        }),
      });
      const dispatcherModule = applicationLoader(
        {
          '@campusforge/db': dbExports,
          '@campusforge/shared': shared,
          '../lib/dispatch-queue': {
            dispatchDocumentParse: async () => {},
            dispatchAIOperation: async () => {},
          },
          '../lib/s3': { deleteFromS3: async () => {}, deleteUploadFromS3: async () => {} },
        },
        environment,
      ).load('apps/worker/src/lifecycle/dispatcher.ts');
      const dispatcher = dispatcherModule.createDocumentDispatcher({
        db: deleteDb,
        enqueueParse: async () => {},
        enqueueAI: async () => {},
        deleteObject: async () => {},
        deleteUploadObject: async () => {},
        batchSize: 10,
      });
      await Promise.all([
        dispatcher.tick(),
        lifecycle.completeOperation({
          operationId: operation.id,
          attemptId: attempt.id,
          leaseToken: owned.leaseToken,
          output: cards,
        }),
      ]);
      assert.equal(await prisma.document.findUnique({ where: { id: doc.id } }), null);
      assert.equal(
        (
          await prisma.documentTask.findUnique({
            where: { id: documentModule.deleteTaskId(doc.id) },
          })
        ).status,
        'DONE',
      );
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 0);
      const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.equal(final.status, 'CANCELLED');
      assert.equal(final.documentId, null);
      assert.equal(
        (await prisma.aIAttempt.findUnique({ where: { id: attempt.id } })).totalTokens,
        150,
      );
      return {
        physicalSourceDeleted: true,
        committedArtifacts: 0,
        usageRetained: true,
        operationStatus: final.status,
        boundary: 'Concurrent actual dispatcher delete and actual completion Prisma transactions',
      };
    },
  );
  await scenario(
    'two workers claim one durable operation; completed redelivery reuses artifact',
    async () => {
      const doc = await document();
      const key = randomUUID();
      const admissions = await Promise.all(
        Array.from({ length: 20 }, () => flashcardAction(form(doc, key))),
      );
      assert.ok(
        admissions.every((admission) => admission.success),
        JSON.stringify(admissions),
      );
      assert.ok(
        admissions.every(
          (admission) => admission.data.operationId === admissions[0].data.operationId,
        ),
      );
      const operation = await prisma.aIJob.findUniqueOrThrow({
        where: { id: admissions[0].data.operationId },
      });
      const gate = deferred();
      const entered = deferred();
      const transport = provider(cards, {
        beforeResponse: async () => {
          entered.resolve();
          await gate.promise;
        },
      });
      const run = processor(transport);
      const first = run(operation.id);
      await entered.promise;
      await run(operation.id);
      gate.resolve();
      await first;
      await run(operation.id);
      assert.equal(transport.calls, 1);
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 1);
      assert.equal(
        (await prisma.aIJob.findUnique({ where: { id: operation.id } })).status,
        'COMPLETED',
      );
      assert.equal(await prisma.aIAttempt.count({ where: { operationId: operation.id } }), 1);
      return { providerCalls: 1, committedArtifacts: 1 };
    },
  );
  await scenario(
    'expired lease recovery fences stale publication and unknown provider outcome',
    async () => {
      const doc = await document();
      const operation = await request(doc);
      const owned = await lifecycle.claimOperation(operation.id);
      assert.ok(owned?.leaseToken);
      const attempt = await lifecycle.beginAttempt(operation.id, owned.leaseToken);
      await prisma.aIJob.update({ where: { id: operation.id }, data: { leaseUntil: new Date(0) } });
      await lifecycle.recoverOperations(100);
      const recovered = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.equal(recovered.status, 'UNCERTAIN');
      assert.equal(
        (await prisma.aIAttempt.findUnique({ where: { id: attempt.id } })).status,
        'UNCERTAIN',
      );
      assert.equal(
        await lifecycle.completeOperation({
          operationId: operation.id,
          attemptId: attempt.id,
          leaseToken: owned.leaseToken,
          output: summary,
        }),
        false,
      );
      assert.equal((await prisma.document.findUnique({ where: { id: doc.id } })).summaryJson, null);
      return { operationStatus: recovered.status, automaticProviderReplay: false };
    },
  );
  await scenario(
    'expired pre-call claim recovers to pending and accepts a fresh fenced worker',
    async () => {
      const doc = await document();
      const operation = await request(doc);
      const old = await lifecycle.claimOperation(operation.id);
      await prisma.aIJob.update({ where: { id: operation.id }, data: { leaseUntil: new Date(0) } });
      await lifecycle.recoverOperations(100);
      const next = await lifecycle.claimOperation(operation.id);
      assert.ok(next?.leaseToken);
      assert.notEqual(next.leaseToken, old.leaseToken);
      assert.equal(await lifecycle.renewLease(operation.id, old.leaseToken), false);
      const attempt = await lifecycle.beginAttempt(operation.id, next.leaseToken);
      await lifecycle.recordResponse(attempt.id, {
        model: 'gpt-4o-mini-2024-07-18',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        usageStatus: 'RECEIVED',
        estimatedCost: 0.000045,
        pricingVersion: aiExports.PRICING_VERSION,
        requestId: 'r4_new_lease',
        latencyMs: 5,
      });
      assert.equal(
        await lifecycle.completeOperation({
          operationId: operation.id,
          attemptId: attempt.id,
          leaseToken: old.leaseToken,
          output: summary,
        }),
        false,
      );
      assert.equal(
        await lifecycle.completeOperation({
          operationId: operation.id,
          attemptId: attempt.id,
          leaseToken: next.leaseToken,
          output: summary,
        }),
        true,
      );
      assert.equal(
        await lifecycle.completeOperation({
          operationId: operation.id,
          attemptId: attempt.id,
          leaseToken: old.leaseToken,
          output: { ...summary, title: 'Stale overwrite' },
        }),
        false,
      );
      assert.equal(
        (await prisma.document.findUnique({ where: { id: doc.id } })).summaryJson.title,
        summary.title,
      );
      return { oldWorkerRenewed: false, stalePublication: false, freshWorkerPublished: true };
    },
  );
  await scenario('long provider work renews lease and remains exclusively owned', async () => {
    const doc = await document();
    const operation = await request(doc);
    const entered = deferred();
    const gate = deferred();
    const transport = provider(summary, {
      beforeResponse: async () => {
        entered.resolve();
        await gate.promise;
      },
    });
    const run = processor(transport, { leaseMs: 150, heartbeatMs: 30 });
    const pending = run(operation.id);
    await entered.promise;
    await delay(350);
    const owned = await prisma.aIJob.findUnique({ where: { id: operation.id } });
    assert.equal(owned.status, 'PROCESSING');
    assert.ok(owned.leaseUntil.getTime() > Date.now());
    await run(operation.id);
    gate.resolve();
    await pending;
    assert.equal(transport.calls, 1);
    assert.equal(
      (await prisma.aIJob.findUnique({ where: { id: operation.id } })).status,
      'COMPLETED',
    );
    return { elapsedProviderWorkMs: 350, initialLeaseMs: 150, heartbeatMs: 30, providerCalls: 1 };
  });
  await scenario(
    'document deletion during provider response does not publish an accessible artifact',
    async () => {
      const doc = await document();
      const operation = await request(doc, { type: 'FLASHCARD' });
      const entered = deferred();
      const gate = deferred();
      const transport = provider(cards, {
        beforeResponse: async () => {
          entered.resolve();
          await gate.promise;
        },
      });
      const pending = processor(transport)(operation.id);
      await entered.promise;
      await documentLifecycle.requestDocumentDeletion(doc.id, workspace.id);
      gate.resolve();
      await pending;
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 0);
      const after = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.notEqual(after.status, 'COMPLETED');
      const attempt = await prisma.aIAttempt.findFirst({ where: { operationId: operation.id } });
      assert.equal(attempt.totalTokens, 150);
      return {
        providerCalls: 1,
        committedArtifacts: 0,
        operationStatus: after.status,
        usageRetained: true,
      };
    },
  );

  await scenario(
    'invalid JSON, schema rejection and partial response retain paid usage',
    async () => {
      const cases = [
        { content: 'private-provider-body invalid JSON', code: 'INVALID_JSON' },
        { output: { ...summary, tldr: '   ' }, code: 'INVALID_OUTPUT' },
        {
          output: { ...summary, sections: [{ heading: ' ', content: ' ' }] },
          code: 'INVALID_OUTPUT',
        },
        { output: { ...summary, unsupported: true }, code: 'INVALID_OUTPUT' },
        { content: 'x'.repeat(70_000), code: 'OUTPUT_BUDGET_EXCEEDED' },
        { finishReason: 'length', code: 'PROVIDER_PARTIAL_RESPONSE' },
      ];
      for (const failure of cases) {
        const doc = await document();
        const operation = await request(doc);
        const transport = provider(failure.output ?? summary, failure);
        await processor(transport)(operation.id);
        const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
        const attempt = await prisma.aIAttempt.findFirst({ where: { operationId: operation.id } });
        assert.equal(final.status, 'FAILED');
        assert.equal(final.errorMessage, failure.code);
        assert.equal(attempt.totalTokens, 150);
        assert.ok(attempt.estimatedMicros > 0);
        assert.equal(
          (await prisma.document.findUnique({ where: { id: doc.id } })).summaryJson,
          null,
        );
        assert.equal(transport.calls, 1);
        assert.doesNotMatch(JSON.stringify(final.errorMessage), /private-provider-body/);
      }
      return {
        cases: cases.length,
        committedArtifacts: 0,
        ledgerRowsWithReceivedUsage: cases.length,
        boundary: 'Real SDK, actual provider/validators and PostgreSQL; mock HTTP responses',
      };
    },
  );
  await scenario(
    'result transaction failure rolls back artifact but retains prior received usage',
    async () => {
      const doc = await document();
      const operation = await request(doc, { type: 'FLASHCARD' });
      let injected = false;
      const faulty = overridden(prisma, {
        $transaction: (callback, options) =>
          prisma.$transaction(
            (tx) =>
              callback(
                overridden(tx, {
                  flashcardSet: overridden(tx.flashcardSet, {
                    create: async () => {
                      injected = true;
                      throw new Error('Synthetic artifact transaction failure');
                    },
                  }),
                }),
              ),
            options,
          ),
      });
      const transport = provider(cards);
      await processor(transport, { db: faulty })(operation.id);
      assert.equal(injected, true);
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 0);
      const attempt = await prisma.aIAttempt.findFirst({ where: { operationId: operation.id } });
      assert.equal(attempt.totalTokens, 150);
      assert.ok(attempt.estimatedMicros > 0);
      assert.notEqual(
        (await prisma.aIJob.findUnique({ where: { id: operation.id } })).status,
        'COMPLETED',
      );
      return {
        artifactTransactionRolledBack: true,
        receivedLedgerCommitted: true,
        providerCalls: transport.calls,
      };
    },
  );
  await scenario(
    'accounting persistence failure becomes explicit uncertain and cannot replay provider',
    async () => {
      const doc = await document();
      const operation = await request(doc);
      const faulty = overridden(prisma, {
        aIAttempt: overridden(prisma.aIAttempt, {
          updateMany: async (args) => {
            if (args.data.status === 'RECEIVED')
              throw new Error('Synthetic ledger persistence failure');
            return prisma.aIAttempt.updateMany(args);
          },
        }),
      });
      const transport = provider();
      const run = processor(transport, { db: faulty });
      await run(operation.id);
      await run(operation.id);
      const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      const attempt = await prisma.aIAttempt.findFirst({ where: { operationId: operation.id } });
      assert.equal(final.status, 'UNCERTAIN');
      assert.equal(final.accountingStatus, 'UNCERTAIN');
      assert.equal(attempt.totalTokens, null);
      assert.equal(attempt.usageStatus, 'UNKNOWN');
      assert.equal(final.errorMessage, 'ACCOUNTING_PERSISTENCE_FAILED');
      assert.equal(transport.calls, 1);
      return {
        providerCalls: 1,
        operationStatus: final.status,
        exactUsageLost: true,
        reservationHeld: true,
      };
    },
  );
  await scenario('missing usage and unknown actual model never masquerade as free', async () => {
    for (const options of [{ missingUsage: true }, { model: 'unknown-provider-snapshot' }]) {
      const doc = await document();
      const operation = await request(doc);
      const transport = provider(summary, options);
      await processor(transport)(operation.id);
      const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      const attempt = await prisma.aIAttempt.findFirst({ where: { operationId: operation.id } });
      assert.equal(final.status, options.model ? 'FAILED' : 'COMPLETED');
      assert.equal(final.accountingStatus, 'UNCERTAIN');
      assert.equal(attempt.estimatedCost, null);
      assert.equal(attempt.estimatedMicros, null);
      assert.equal(final.estimatedCost, null);
    }
    return {
      completedValidArtifacts: 1,
      rejectedUnknownActualModel: 1,
      uncertainAccounting: 2,
      unknownCostIsNull: true,
    };
  });
  await scenario(
    '20 concurrent reservations respect workspace cost and concurrency limits',
    async () => {
      const budgetWorkspace = await prisma.workspace.create({
        data: { name: 'R4 budget race', type: 'PERSONAL', ownerId: user.id },
      });
      await prisma.membership.create({
        data: { userId: user.id, workspaceId: budgetWorkspace.id, role: 'OWNER' },
      });
      const doc = await document(budgetWorkspace.id);
      const outcomes = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          request(doc, {
            workspaceId: budgetWorkspace.id,
            reservationMicros: 4000,
            workspaceBudgetMicros: 10_000,
            workspaceConcurrency: 30,
          }),
        ),
      );
      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 2);
      assert.ok(
        outcomes
          .filter((outcome) => outcome.status === 'rejected')
          .every((outcome) => outcome.reason.code === 'WORKSPACE_BUDGET_EXCEEDED'),
      );
      const budget = await prisma.aIWorkspaceBudget.findUnique({
        where: { workspaceId: budgetWorkspace.id },
      });
      assert.equal(budget.reservedMicros, 8000);
      assert.equal(budget.activeOperations, 2);
      const concurrencyWorkspace = await prisma.workspace.create({
        data: { name: 'R4 concurrency race', type: 'PERSONAL', ownerId: user.id },
      });
      await prisma.membership.create({
        data: { userId: user.id, workspaceId: concurrencyWorkspace.id, role: 'OWNER' },
      });
      const concurrencyDoc = await document(concurrencyWorkspace.id);
      const slots = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          request(concurrencyDoc, {
            workspaceId: concurrencyWorkspace.id,
            workspaceConcurrency: 2,
          }),
        ),
      );
      assert.equal(slots.filter((outcome) => outcome.status === 'fulfilled').length, 2);
      assert.ok(
        slots
          .filter((outcome) => outcome.status === 'rejected')
          .every((outcome) => outcome.reason.code === 'WORKSPACE_CONCURRENCY_EXCEEDED'),
      );
      return {
        budgetRequests: 20,
        acceptedCostReservations: 2,
        reservedMicros: 8000,
        concurrencyRequests: 20,
        acceptedSlots: 2,
        boundary: 'Real concurrent PostgreSQL admission transactions',
      };
    },
  );
  await scenario('429/5xx retry budget is exact; 401/network/timeout stop safely', async () => {
    const retryResults = [];
    for (const status of [429, 500]) {
      const doc = await document();
      const operation = await request(doc);
      const transport = provider(summary, { status });
      const run = processor(transport, { random: () => 0 });
      for (let attempt = 0; attempt < parameters.maxAttempts; attempt++) {
        await run(operation.id);
        await prisma.aIJob.updateMany({
          where: { id: operation.id, status: 'RETRY_WAIT' },
          data: { nextAttemptAt: new Date(0) },
        });
      }
      await run(operation.id);
      assert.equal(transport.calls, parameters.maxAttempts);
      assert.equal(
        await prisma.aIAttempt.count({ where: { operationId: operation.id } }),
        parameters.maxAttempts,
      );
      const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.equal(final.status, 'FAILED');
      if (status === 500) {
        assert.equal(final.accountingStatus, 'UNCERTAIN');
        const attempts = await prisma.aIAttempt.findMany({ where: { operationId: operation.id } });
        assert.ok(
          attempts.every(
            (attempt) => attempt.usageStatus === 'UNKNOWN' && attempt.estimatedCost === null,
          ),
        );
      }
      retryResults.push({
        status,
        calls: transport.calls,
        accountingStatus: final.accountingStatus,
      });
    }
    const recoveredDoc = await document();
    const recoveredOperation = await request(recoveredDoc);
    const recoverOptions = { status: 500 };
    const recoveredTransport = provider(summary, recoverOptions);
    const recoveredRun = processor(recoveredTransport);
    await recoveredRun(recoveredOperation.id);
    recoverOptions.status = undefined;
    await prisma.aIJob.update({
      where: { id: recoveredOperation.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await recoveredRun(recoveredOperation.id);
    const retrySuccess = await prisma.aIJob.findUnique({ where: { id: recoveredOperation.id } });
    assert.equal(retrySuccess.status, 'COMPLETED');
    assert.equal(retrySuccess.accountingStatus, 'UNCERTAIN');
    assert.equal(recoveredTransport.calls, 2);
    for (const options of [
      { status: 401 },
      { error: new TypeError('Synthetic network failure') },
      { beforeResponse: async () => new Promise(() => {}) },
    ]) {
      const doc = await document();
      const operation = await request(doc, {
        parameters: { ...parameters, connectionTimeoutMs: 100, requestTimeoutMs: 200 },
      });
      const transport = provider(summary, options);
      const run = processor(transport);
      const started = performance.now();
      await run(operation.id);
      await run(operation.id);
      assert.ok(performance.now() - started < 2000);
      assert.equal(transport.calls, 1);
      const final = await prisma.aIJob.findUnique({ where: { id: operation.id } });
      assert.equal(final.status, options.status === 401 ? 'FAILED' : 'UNCERTAIN');
    }
    return {
      retryResults,
      nonretryableCallsEach: 1,
      hiddenSDKRetries: 0,
      successfulRetryAfter5xxAccounting: retrySuccess.accountingStatus,
      boundary: 'Actual OpenAI SDK mocked fetch; real persisted attempt identities',
    };
  });
  await scenario(
    'two actual dispatchers share R3 outbox and stable AI queue identity',
    async () => {
      const dispatch = applicationLoader({}, environment).load(
        'apps/worker/src/lib/dispatch-queue.ts',
      );
      const delivered = new Map();
      const enqueueAI = async (operationId, jobId) => {
        delivered.set(operationId, (delivered.get(operationId) ?? 0) + 1);
        await dispatch.dispatchAIOperation(operationId, jobId);
      };
      const dispatcherModule = applicationLoader(
        {
          '@campusforge/db': dbExports,
          '@campusforge/shared': shared,
          '../lib/dispatch-queue': {
            dispatchDocumentParse: async () => {},
            dispatchAIOperation: enqueueAI,
          },
          '../lib/s3': { deleteFromS3: async () => {}, deleteUploadFromS3: async () => {} },
        },
        environment,
      ).load('apps/worker/src/lifecycle/dispatcher.ts');
      const dispatcher = () =>
        dispatcherModule.createDocumentDispatcher({
          db: prisma,
          enqueueParse: async () => {},
          enqueueAI,
          deleteObject: async () => {},
          deleteUploadObject: async () => {},
          visibilityMs: 5000,
          batchSize: 100,
        });
      await Promise.all([dispatcher().tick(), dispatcher().tick()]);
      assert.ok(delivered.size > 0);
      assert.ok([...delivered.values()].every((count) => count === 1));
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
      for (const operationId of delivered.keys())
        assert.equal(jobs.filter((job) => job.data.operationId === operationId).length, 1);
      assert.ok(
        jobs.every(
          (job) =>
            job.opts.attempts === 1 &&
            job.opts.removeOnComplete.count === 1000 &&
            job.opts.removeOnFail.count === 1000,
        ),
      );
      const pendingBefore = jobs.map((job) => job.id);
      await dispatch.cleanupAIQueueHistory(2);
      assert.equal(
        (await queue.getJobs(['waiting', 'delayed', 'active'])).length,
        pendingBefore.length,
      );
      return {
        operationsDispatched: delivered.size,
        independentQueuesPerOperation: 1,
        boundary: 'Actual R3 dispatcher extension; real PostgreSQL CAS and BullMQ',
      };
    },
  );
  await scenario(
    'real worker process crash after DB commit before BullMQ ack; restart/replay/cleanup',
    async () => {
      const doc = await document();
      const operation = await request(doc, { type: 'FLASHCARD' });
      const queueName = `r4-crash-${randomUUID()}`;
      const crashQueue = new Queue(queueName, { connection: redis });
      crashQueue.on('error', () => {});
      extraQueues.push(crashQueue);
      const jobId = `ai-${operation.id}`;
      const child = spawn(
        process.execPath,
        [resolve(root, 'tests/fixtures/r4-worker-process.mjs')],
        {
          cwd: root,
          env: syntheticChildEnv({ ...environment, R4_QUEUE_NAME: queueName }),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      );
      children.push(child);
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      const ready = deferred();
      const committed = deferred();
      child.on('message', (message) => {
        if (message.event === 'ready') ready.resolve();
        if (message.event === 'committed' && message.operationId === operation.id)
          committed.resolve();
      });
      const exit = new Promise((done) => child.once('exit', done));
      await Promise.race([
        ready.promise,
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error(`Crash worker readiness: ${output}`);
        }),
      ]);
      await crashQueue.add(
        'flashcards',
        { operationId: operation.id },
        {
          jobId,
          attempts: 1,
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      );
      await Promise.race([
        committed.promise,
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error(`Crash worker commit: ${output}`);
        }),
      ]);
      assert.equal(await exit, 19);
      writeFileSync(resolve(evidence, 'integration-worker-crash.log'), output);
      assert.equal(
        (await prisma.aIJob.findUnique({ where: { id: operation.id } })).status,
        'COMPLETED',
      );
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 1);
      const transport = provider(cards);
      const restarted = new Worker(queueName, (job) => processor(transport)(job.data.operationId), {
        connection: redis,
        lockDuration: 500,
        stalledInterval: 300,
        maxStalledCount: 1,
      });
      restarted.on('error', () => {});
      workers.push(restarted);
      await waitFor(
        async () =>
          (await crashQueue.getJob(jobId))?.getState().then((state) => state === 'completed'),
        'BullMQ stalled redelivery after process restart',
        12_000,
      );
      assert.equal(transport.calls, 0);
      assert.equal(await prisma.aIAttempt.count({ where: { operationId: operation.id } }), 1);
      await crashQueue.clean(0, 100, 'completed');
      assert.equal(await crashQueue.getJob(jobId), undefined);
      await crashQueue.add(
        'flashcards',
        { operationId: operation.id },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      await waitFor(
        async () => !(await crashQueue.getJob(jobId)),
        'Completed replay after queue record cleanup',
      );
      assert.equal(transport.calls, 0);
      assert.equal(await prisma.flashcardSet.count({ where: { operationId: operation.id } }), 1);
      return {
        childExitAfterCommit: 19,
        processIncarnations: 2,
        committedArtifacts: 1,
        totalProviderAttempts: 1,
        providerCallsAfterRestartAndCleanup: 0,
        boundary:
          'Actual OS process exit before BullMQ callback returns; real stalled redelivery and Redis cleanup',
      };
    },
  );
  await scenario(
    'bounded metadata cleanup retains active/pending/uncertain work and tenant ledger',
    async () => {
      const all = await prisma.aIAttempt.findMany({
        where: {
          operation: {
            workspaceId: workspace.id,
            accountingStatus: 'SETTLED',
            status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
          },
        },
      });
      assert.ok(all.length > 0);
      await prisma.aIAttempt.updateMany({
        where: { id: { in: all.map((attempt) => attempt.id) } },
        data: { finishedAt: new Date(0), providerRequestId: 'r4_retention_fixture' },
      });
      const counts = {
        operations: await prisma.aIJob.count(),
        attempts: await prisma.aIAttempt.count(),
        tasks: await prisma.documentTask.count(),
        artifacts: await prisma.flashcardSet.count(),
      };
      const pendingIds = (
        await prisma.aIJob.findMany({
          where: { status: { in: ['PENDING', 'RETRY_WAIT', 'PROCESSING', 'UNCERTAIN'] } },
        })
      ).map((operation) => operation.id);
      const first = await lifecycle.cleanupAttemptMetadata({
        before: new Date(),
        batchSize: 2,
        workspaceId: workspace.id,
      });
      assert.equal(first, 2);
      const foreignCount = await lifecycle.cleanupAttemptMetadata({
        before: new Date(),
        batchSize: 100,
        workspaceId: otherWorkspace.id,
      });
      assert.equal(foreignCount, 0);
      await lifecycle.cleanupAttemptMetadata({
        before: new Date(),
        batchSize: 100,
        workspaceId: workspace.id,
      });
      assert.equal(
        await lifecycle.cleanupAttemptMetadata({
          before: new Date(),
          batchSize: 100,
          workspaceId: workspace.id,
        }),
        0,
      );
      assert.equal(await prisma.aIJob.count(), counts.operations);
      assert.equal(await prisma.aIAttempt.count(), counts.attempts);
      assert.equal(await prisma.documentTask.count(), counts.tasks);
      assert.equal(await prisma.flashcardSet.count(), counts.artifacts);
      assert.equal(
        await prisma.aIJob.count({ where: { id: { in: pendingIds } } }),
        pendingIds.length,
      );
      assert.ok(
        (
          await prisma.aIAttempt.findMany({
            where: { id: { in: all.map((attempt) => attempt.id) } },
          })
        ).every(
          (attempt) => attempt.totalTokens === all.find((row) => row.id === attempt.id).totalTokens,
        ),
      );
      return {
        firstBatchCompacted: 2,
        repeatedRunCompacted: 0,
        pendingRetained: pendingIds.length,
        numericLedgerAndArtifactsRetained: true,
      };
    },
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  for (const worker of workers) await worker.close(true).catch(() => {});
  for (const extraQueue of extraQueues) await extraQueue.close().catch(() => {});
  await queue?.close().catch(() => {});
  redis?.disconnect();
  await prisma?.$disconnect().catch(() => {});
  await migrationStage?.clean();
  await infra?.clean();
  save();
}
