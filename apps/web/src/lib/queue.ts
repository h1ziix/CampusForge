/** HTTP producers have a finite lifetime. Document parsing uses the DB outbox. */
import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export const HTTP_QUEUE_DEADLINE_MS = 1500;

/**
 * One request owns one connection; timeout destroys the transport and drains the
 * operation before returning. Nothing is queued offline or reconnected later.
 * A server may have accepted a command before the response was lost: AI operation
 * idempotency/accounting remains R4; HTTP callers receive a retryable error.
 */
async function addHTTPJob(name: string, data: object, options: JobsOptions): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    autoResendUnfulfilledCommands: false,
    connectTimeout: HTTP_QUEUE_DEADLINE_MS,
    commandTimeout: HTTP_QUEUE_DEADLINE_MS,
    socketTimeout: HTTP_QUEUE_DEADLINE_MS,
  });
  connection.on('error', () => {});
  let queue: Queue | undefined;
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    connection.disconnect(false);
  }, HTTP_QUEUE_DEADLINE_MS);
  try {
    await connection.connect();
    if (expired) throw new Error('Queue request deadline exceeded');
    queue = new Queue('ai-pipeline', { connection });
    queue.on('error', () => {});
    await queue.add(name, data, options);
    if (expired) throw new Error('Queue request deadline exceeded');
  } finally {
    clearTimeout(deadline);
    connection.disconnect(false);
    await queue?.close().catch(() => {});
  }
}

export async function enqueueSummaryGeneration(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
}): Promise<void> {
  await addHTTPJob('summary', input, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}

export async function enqueueFlashcardGeneration(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
}): Promise<void> {
  await addHTTPJob('flashcard', input, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}
