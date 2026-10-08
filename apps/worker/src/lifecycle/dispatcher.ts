import {
  prisma,
  newDocumentLeaseToken,
  parseTaskId,
  PARSE_MAX_ATTEMPTS,
  type PrismaClient,
  type Prisma,
} from '@campusforge/db';
import { dispatchDocumentParse } from '../lib/dispatch-queue';
import { deleteFromS3, deleteUploadFromS3 } from '../lib/s3';

export interface DocumentDispatcherOptions {
  db: PrismaClient;
  enqueueParse: (documentId: string, jobId: string) => Promise<void>;
  deleteObject: (key: string) => Promise<void>;
  deleteUploadObject: (key: string, uploadId: string) => Promise<void>;
  now?: () => Date;
  batchSize?: number;
  leaseMs?: number;
  visibilityMs?: number;
}

/** Multiple processes may poll; CAS claims and expiring DB leases serialize work. */
export function createDocumentDispatcher(options: DocumentDispatcherOptions) {
  const { db, enqueueParse, deleteObject, deleteUploadObject } = options;
  const now = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? 10;
  const leaseMs = options.leaseMs ?? 60_000;
  const visibilityMs = options.visibilityMs ?? 60_000;
  let running = false;
  let parseCursor: string | undefined;

  async function reconcileParsing() {
    const at = now();
    const exhausted = await db.document.findMany({
      where: {
        lifecycle: 'ACTIVE',
        processingStatus: 'PROCESSING',
        parseAttempts: { gte: PARSE_MAX_ATTEMPTS },
        OR: [{ parseLeaseUntil: null }, { parseLeaseUntil: { lte: at } }],
      },
      take: batchSize,
    });
    for (const doc of exhausted)
      await db.$transaction(async (tx) => {
        const recovered = await tx.document.updateMany({
          where: {
            id: doc.id,
            lifecycle: 'ACTIVE',
            processingStatus: 'PROCESSING',
            parseAttempts: { gte: PARSE_MAX_ATTEMPTS },
            OR: [{ parseLeaseUntil: null }, { parseLeaseUntil: { lte: at } }],
          },
          data: {
            processingStatus: 'FAILED',
            parseLeaseToken: null,
            parseLeaseUntil: null,
            parseError: 'Document parsing exhausted its crash/retry budget.',
          },
        });
        if (recovered.count === 1)
          await tx.documentTask.updateMany({
            where: { id: parseTaskId(doc.id) },
            data: { status: 'DONE', leaseToken: null, leaseUntil: null },
          });
      });
    const docs = await db.document.findMany({
      where: {
        lifecycle: 'ACTIVE',
        processingStatus: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
        parseAttempts: { lt: PARSE_MAX_ATTEMPTS },
        ...(parseCursor ? { id: { gt: parseCursor } } : {}),
      },
      take: batchSize,
      orderBy: { id: 'asc' },
    });
    for (const doc of docs)
      await db.documentTask.upsert({
        where: { id: parseTaskId(doc.id) },
        create: {
          id: parseTaskId(doc.id),
          documentId: doc.id,
          workspaceId: doc.workspaceId,
          storageKey: doc.storageKey,
          kind: 'PARSE',
          availableAt: doc.parseNextAttemptAt,
        },
        update: {},
      });
    // Advance even when Redis is down: old pending rows cannot starve later
    // legacy/missing-task repair. A new process starts another bounded sweep.
    parseCursor = docs.length === batchSize ? docs.at(-1)?.id : undefined;
  }

  async function dispatchTask() {
    const at = now();
    const eligibility: Prisma.DocumentTaskWhereInput = {
      availableAt: { lte: at },
      OR: [{ status: 'PENDING' }, { status: 'CLAIMED', leaseUntil: { lte: at } }],
    };
    const task = await db.documentTask.findFirst({
      where: eligibility,
      orderBy: { availableAt: 'asc' },
    });
    if (!task) return false;
    const token = newDocumentLeaseToken();
    const claim = await db.documentTask.updateMany({
      where: { id: task.id, ...eligibility },
      data: {
        status: 'CLAIMED',
        leaseToken: token,
        leaseUntil: new Date(at.getTime() + leaseMs),
        attempts: { increment: 1 },
      },
    });
    if (claim.count !== 1) return true;
    const owned = { id: task.id, status: 'CLAIMED' as const, leaseToken: token };
    try {
      const doc = await db.document.findUnique({ where: { id: task.documentId } });
      if (task.kind === 'PARSE') {
        if (
          !doc ||
          doc.lifecycle !== 'ACTIVE' ||
          doc.processingStatus === 'COMPLETED' ||
          doc.parseAttempts >= PARSE_MAX_ATTEMPTS
        ) {
          await db.documentTask.updateMany({
            where: owned,
            data: { status: 'DONE', leaseToken: null, leaseUntil: null },
          });
          return true;
        }
        await enqueueParse(doc.id, task.id);
        // Delivered is not terminal: disappeared/completed/failed Redis records
        // cannot erase the persisted obligation to finish parsing.
        await db.documentTask.updateMany({
          where: owned,
          data: {
            status: 'PENDING',
            availableAt: new Date(now().getTime() + visibilityMs),
            leaseToken: null,
            leaseUntil: null,
            lastError: null,
          },
        });
      } else {
        if (
          doc &&
          (doc.lifecycle !== 'DELETING' ||
            doc.storageKey !== task.storageKey ||
            doc.workspaceId !== task.workspaceId)
        ) {
          throw new Error('Deletion task does not own a tombstoned document');
        }
        await deleteObject(task.storageKey);
        await db.$transaction(async (tx) => {
          const finished = await tx.documentTask.updateMany({
            where: { ...owned, leaseUntil: { gt: now() } },
            data: { status: 'DONE', leaseToken: null, leaseUntil: null, lastError: null },
          });
          if (finished.count !== 1) return;
          // Existing AI artifacts retain their prior SetNull policy.
          await tx.document.deleteMany({
            where: {
              id: task.documentId,
              lifecycle: 'DELETING',
              storageKey: task.storageKey,
              workspaceId: task.workspaceId,
            },
          });
        });
      }
    } catch {
      const retryAt = new Date(
        now().getTime() + Math.min(300_000, 1000 * 2 ** Math.min(task.attempts + 1, 8)),
      );
      await db.documentTask.updateMany({
        where: owned,
        data: {
          status: 'PENDING',
          availableAt: retryAt,
          leaseToken: null,
          leaseUntil: null,
          lastError: 'Durable document task failed; retry scheduled',
        },
      });
    }
    return true;
  }

  async function cleanupUpload() {
    const at = now();
    const eligibility: Prisma.DocumentUploadIntentWhereInput = {
      availableAt: { lte: at },
      AND: [
        { OR: [{ status: 'CLEANUP' }, { status: 'UPLOADING', expiresAt: { lte: at } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }] },
      ],
    };
    const intent = await db.documentUploadIntent.findFirst({
      where: eligibility,
      orderBy: { availableAt: 'asc' },
    });
    if (!intent) return false;
    const token = newDocumentLeaseToken();
    const claim = await db.documentUploadIntent.updateMany({
      where: { id: intent.id, ...eligibility },
      data: {
        status: 'CLEANUP',
        leaseToken: token,
        leaseUntil: new Date(at.getTime() + leaseMs),
        attempts: { increment: 1 },
      },
    });
    if (claim.count !== 1) return true;
    const owned = { id: intent.id, status: 'CLEANUP' as const, leaseToken: token };
    try {
      // HEAD metadata prevents deleting an object a conditional PUT never owned.
      await deleteUploadObject(intent.storageKey, intent.id);
      const complete = now().getTime() >= intent.cleanupUntil.getTime();
      await db.documentUploadIntent.updateMany({
        where: owned,
        data: {
          status: complete ? 'DONE' : 'CLEANUP',
          availableAt: new Date(now().getTime() + 60_000),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
    } catch {
      await db.documentUploadIntent.updateMany({
        where: owned,
        data: {
          availableAt: new Date(
            now().getTime() + Math.min(300_000, 1000 * 2 ** Math.min(intent.attempts + 1, 8)),
          ),
          leaseToken: null,
          leaseUntil: null,
          lastError: 'Upload cleanup failed; retry scheduled',
        },
      });
    }
    return true;
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await reconcileParsing();
      for (let i = 0; i < batchSize; i++) if (!(await dispatchTask())) break;
      for (let i = 0; i < batchSize; i++) if (!(await cleanupUpload())) break;
    } finally {
      running = false;
    }
  }
  return { tick };
}

export const documentDispatcher = createDocumentDispatcher({
  db: prisma,
  enqueueParse: dispatchDocumentParse,
  deleteObject: deleteFromS3,
  deleteUploadObject: deleteUploadFromS3,
});
