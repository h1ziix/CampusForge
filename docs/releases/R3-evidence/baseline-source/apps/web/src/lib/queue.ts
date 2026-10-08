/**
 * CampusForge job queue client.
 *
 * Used server-side to enqueue background jobs (document parsing, AI pipeline, etc.).
 * BullMQ connects to Redis. The actual processing happens in apps/worker.
 *
 * This module is ONLY imported in server-side code (Route Handlers, Server Actions).
 * Never import from client components.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Lazy connection — avoids connecting during Next.js build
let _connection: IORedis | null = null;
function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return _connection;
}

// Lazy queue — created on first enqueue
let _documentQueue: Queue | null = null;
function getDocumentQueue(): Queue {
  if (!_documentQueue) {
    _documentQueue = new Queue('document-processing', {
      connection: getConnection(),
    });
  }
  return _documentQueue;
}

let _aiQueue: Queue | null = null;
function getAIQueue(): Queue {
  if (!_aiQueue) {
    _aiQueue = new Queue('ai-pipeline', {
      connection: getConnection(),
    });
  }
  return _aiQueue;
}

/**
 * Enqueue a document for text extraction.
 * The worker picks this up and runs the parser.
 *
 * Retries up to 3 times with exponential backoff.
 */
export async function enqueueDocumentParsing(documentId: string): Promise<void> {
  await getDocumentQueue().add(
    'parse',
    { documentId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
}

/**
 * Enqueue a document summary generation job.
 * Requires the document to already have parsedText.
 *
 * Retries up to 2 times with exponential backoff (AI calls are expensive,
 * limit retries to avoid runaway costs).
 */
export async function enqueueSummaryGeneration(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
}): Promise<void> {
  await getAIQueue().add('summary', input, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}

/**
 * Enqueue a flashcard generation job for a document.
 * Requires the document to already have parsedText.
 *
 * Retries up to 2 times with exponential backoff (AI calls are expensive,
 * limit retries to avoid runaway costs).
 */
export async function enqueueFlashcardGeneration(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
}): Promise<void> {
  await getAIQueue().add('flashcard', input, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}
