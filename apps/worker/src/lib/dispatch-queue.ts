import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/** Finite producer policy; workers retain their distinct reconnecting policy. */
export async function dispatchDocumentParse(documentId: string, jobId: string): Promise<void> {
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
    queue = new Queue('document-processing', { connection });
    queue.on('error', () => {});
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
    if (expired) throw new Error('Redis dispatch deadline exceeded');
  } finally {
    clearTimeout(deadline);
    connection.disconnect(false);
    await queue?.close().catch(() => {});
  }
}
