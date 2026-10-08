// Disposable-probe child only. Actual processor and SDK, deterministic fetch.
// Exits after the result transaction and before BullMQ can acknowledge the job.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { applicationLoader, root } from './r3-source-loader.mjs';

const requireDB = createRequire(resolve(root, 'packages/db/package.json'));
const requireAI = createRequire(resolve(root, 'packages/ai/package.json'));
const requireWorker = createRequire(resolve(root, 'apps/worker/package.json'));
const { PrismaClient } = requireDB(resolve(root, 'packages/db/generated/client'));
const { Worker } = requireWorker('bullmq');
const Redis = requireWorker('ioredis');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const dbModule = applicationLoader({ './client': { prisma } }).load(
  'packages/db/src/ai-lifecycle.ts',
);
const shared = applicationLoader({}, process.env).load('packages/shared/src/index.ts');
const ai = applicationLoader({ openai: requireAI('openai') }).load('packages/ai/src/index.ts');
const provider = new ai.AIProvider({
  apiKey: 'r4-only-synthetic-key',
  model: 'gpt-4o-mini',
  fetch: async () =>
    new Response(
      JSON.stringify({
        id: 'r4-child-synthetic',
        model: 'gpt-4o-mini-2024-07-18',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                title: 'Child study cards',
                cards: [
                  { front: 'What is respiration?', back: 'Respiration releases energy for cells.' },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      { headers: { 'content-type': 'application/json', 'x-request-id': 'r4_child_request' } },
    ),
});
const processOperation = applicationLoader(
  {
    '@campusforge/db': { prisma, ...dbModule },
    '@campusforge/ai': ai,
    '@campusforge/shared': shared,
  },
  process.env,
)
  .load('apps/worker/src/jobs/ai-operation.ts')
  .createAIOperationProcessor({ db: prisma, provider });
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on('error', () => {});
const worker = new Worker(
  process.env.R4_QUEUE_NAME,
  async (job) => {
    await processOperation(job.data.operationId);
    process.send?.({ event: 'committed', operationId: job.data.operationId }, () =>
      process.exit(19),
    );
  },
  { connection: redis, lockDuration: 500, stalledInterval: 300, maxStalledCount: 1 },
);
worker.on('error', (error) => process.send?.({ event: 'error', code: error.name }));
await worker.waitUntilReady();
process.send?.({ event: 'ready' });
