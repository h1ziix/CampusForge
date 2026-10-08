/**
 * CampusForge Background Worker
 *
 * Runs as a separate Node.js process alongside the Next.js web server.
 * Connects to Redis via BullMQ and processes background jobs:
 *
 * - document-processing: Extracts text from uploaded documents (PDF, TXT, MD)
 * - ai-pipeline: AI-powered features (summaries, flashcards, quizzes, etc.)
 *
 * Start with: pnpm --filter @campusforge/worker dev
 */
import { Worker } from 'bullmq';
import { getRedisConnection } from './lib/redis';
import { processDocumentJob } from './jobs/parse-document';
import { processSummaryJob } from './jobs/generate-summary';
import { processFlashcardJob } from './jobs/generate-flashcards';
import { documentDispatcher } from './lifecycle/dispatcher';

console.log('[CampusForge Worker] Runtime modules loaded; infrastructure readiness pending.');

const connection = getRedisConnection();
connection.on('error', () => {
  console.error('[CampusForge Worker] Redis connection unavailable.');
});

// Runs independently of Redis readiness; Postgres retains obligations during
// outages. Every worker instance may dispatch using atomic expiring DB claims.
let stopping = false;
let dispatching: Promise<void> | null = null;
function dispatchTick() {
  if (stopping || dispatching) return;
  dispatching = documentDispatcher
    .tick()
    .catch(() => {
      console.error(
        '[CampusForge Worker] Document dispatcher unavailable; durable retry retained.',
      );
    })
    .finally(() => {
      dispatching = null;
    });
}
const dispatchTimer = setInterval(dispatchTick, 2000);
dispatchTick();

// ─── Document Processing Worker ─────────────────────────────────
const documentWorker = new Worker(
  'document-processing',
  async (job) => {
    console.log(`[CampusForge Worker] Processing job ${job.id} (${job.name}) ...`);

    switch (job.name) {
      case 'parse':
        await processDocumentJob(job.data.documentId);
        break;

      default:
        console.warn(`[CampusForge Worker] Unknown job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2, // Process up to 2 documents in parallel
  },
);

documentWorker.on('completed', (job) => {
  console.log(`[CampusForge Worker] Job ${job.id} completed successfully.`);
});

documentWorker.on('failed', (job, err) => {
  console.error(`[CampusForge Worker] Job ${job?.id} failed: ${err.message}`);
});

documentWorker.on('error', () => {
  console.error('[CampusForge Worker] Document queue connection unavailable.');
});

// ─── AI Pipeline Worker ─────────────────────────────────────────
const aiWorker = new Worker(
  'ai-pipeline',
  async (job) => {
    console.log(`[CampusForge Worker] AI job ${job.id} (${job.name}) ...`);

    switch (job.name) {
      case 'summary':
        await processSummaryJob(job.data);
        break;

      case 'flashcard':
        await processFlashcardJob(job.data);
        break;

      // Future AI jobs go here:
      // case 'quiz':

      default:
        console.warn(`[CampusForge Worker] Unknown AI job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2, // AI calls are IO-bound, safe to parallelize
  },
);

aiWorker.on('completed', (job) => {
  console.log(`[CampusForge Worker] AI job ${job.id} completed successfully.`);
});

aiWorker.on('failed', (job, err) => {
  console.error(`[CampusForge Worker] AI job ${job?.id} failed: ${err.message}`);
});

aiWorker.on('error', () => {
  console.error('[CampusForge Worker] AI queue connection unavailable.');
});

Promise.all([documentWorker.waitUntilReady(), aiWorker.waitUntilReady()])
  .then(() => {
    console.log(
      '[CampusForge Worker] Redis queues ready: document-processing, ai-pipeline. Database, S3, and AI readiness have not been checked.',
    );
  })
  .catch(() => {
    console.error('[CampusForge Worker] Queue initialization failed; runtime is not ready.');
  });

// Graceful shutdown
async function shutdown() {
  console.log('[CampusForge Worker] Shutting down...');
  stopping = true;
  clearInterval(dispatchTimer);
  await dispatching;
  await Promise.all([documentWorker.close(), aiWorker.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
