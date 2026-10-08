import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/** Finite producer policy; workers retain their distinct reconnecting policy. */
export async function dispatchDocumentParse(documentId: string, jobId: string): Promise<void> {
  await withDispatchQueue('document-processing', async (queue) => {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') await existing.remove();
    }
    await queue.add(
      'parse',
      { documentId },
      {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });
}

export const AI_QUEUE_RETENTION = {
  completed: { age: 24 * 60 * 60, count: 1000 },
  failed: { age: 7 * 24 * 60 * 60, count: 1000 },
};

export async function dispatchAIOperation(operationId: string, jobId: string): Promise<void> {
  await withDispatchQueue('ai-pipeline', async (queue) => {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') await existing.remove();
    }
    await queue.add(
      'operation',
      { operationId },
      {
        jobId,
        attempts: 1,
        removeOnComplete: AI_QUEUE_RETENTION.completed,
        removeOnFail: AI_QUEUE_RETENTION.failed,
      },
    );
  });
}

export async function cleanupAIQueueHistory(batchSize = 100): Promise<void> {
  await withDispatchQueue('ai-pipeline', async (queue) => {
    const limit = Math.min(1000, Math.max(1, batchSize));
    await queue.clean(AI_QUEUE_RETENTION.completed.age * 1000, limit, 'completed');
    await queue.clean(AI_QUEUE_RETENTION.failed.age * 1000, limit, 'failed');
  });
}

async function withDispatchQueue(
  queueName: string,
  work: (queue: Queue) => Promise<void>,
): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    autoResendUnfulfilledCommands: false,
    connectTimeout: 1500,
    commandTimeout: 1500,
    socketTimeout: 3000,
  });
  connection.on('error', () => {});
  let queue: Queue | undefined;
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    connection.disconnect(false);
  }, 3000);
  try {
    await connection.connect();
    queue = new Queue(queueName, { connection });
    queue.on('error', () => {});
    await work(queue);
    if (expired) throw new Error('Redis dispatch deadline exceeded');
  } finally {
    clearTimeout(deadline);
    connection.disconnect(false);
    await queue?.close().catch(() => {});
  }
}
