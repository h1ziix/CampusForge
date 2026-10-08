import { prisma, createAIOperationLifecycle, type PrismaClient } from '@campusforge/db';
import { readAIEnvironmentPolicy } from '@campusforge/shared';
import { cleanupAIQueueHistory } from '../lib/dispatch-queue';

export function createAIMaintenance(options: {
  db: PrismaClient;
  now?: () => Date;
  cleanupQueue?: (batchSize: number) => Promise<void>;
}) {
  const now = options.now ?? (() => new Date());
  const lifecycle = createAIOperationLifecycle(options.db, { now });
  return async function tick(): Promise<void> {
    const policy = readAIEnvironmentPolicy();
    await lifecycle.recoverOperations(policy.cleanupBatchSize);
    await lifecycle.cleanupAttemptMetadata({
      before: new Date(now().getTime() - policy.attemptRetentionDays * 86_400_000),
      batchSize: policy.cleanupBatchSize,
    });
    await (options.cleanupQueue ?? cleanupAIQueueHistory)(policy.cleanupBatchSize);
  };
}

export const aiMaintenance = createAIMaintenance({ db: prisma });
