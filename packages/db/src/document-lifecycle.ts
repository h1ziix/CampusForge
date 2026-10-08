import { randomUUID } from 'node:crypto';
import { prisma } from './client';
import type { PrismaClient } from '../generated/client';

export const UPLOAD_LEASE_MS = 10 * 60_000;
export const UPLOAD_QUARANTINE_MS = 24 * 60 * 60_000;
export const PARSE_LEASE_MS = 60_000;
export const PARSE_MAX_ATTEMPTS = 5;
export const parseTaskId = (id: string): string => `parse-${id}-v1`;
export const deleteTaskId = (id: string): string => `delete-${id}`;

export interface DocumentUploadInput {
  id: string;
  storageKey: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Network I/O belongs outside these short, DB-only transactions. */
export function createDocumentLifecycle(db: PrismaClient, now = () => new Date()) {
  async function beginDocumentUpload(input: DocumentUploadInput): Promise<void> {
    const at = now();
    await db.documentUploadIntent.create({
      data: {
        ...input,
        expiresAt: new Date(at.getTime() + UPLOAD_LEASE_MS),
        cleanupUntil: new Date(at.getTime() + UPLOAD_LEASE_MS + UPLOAD_QUARANTINE_MS),
        availableAt: new Date(at.getTime() + UPLOAD_LEASE_MS),
      },
    });
  }

  async function getAcceptedDocumentUpload(id: string): Promise<{ id: string } | null> {
    const intent = await db.documentUploadIntent.findUnique({ where: { id } });
    if (intent?.status !== 'FINALIZED') return null;
    return db.document.findFirst({ where: { id, lifecycle: 'ACTIVE' }, select: { id: true } });
  }

  async function finalizeDocumentUpload(id: string): Promise<{ id: string }> {
    return db.$transaction(async (tx) => {
      const intent = await tx.documentUploadIntent.findUnique({ where: { id } });
      if (!intent) throw new Error('Upload intent not found');
      if (intent.status === 'FINALIZED') {
        const accepted = await tx.document.findFirst({
          where: { id, lifecycle: 'ACTIVE' },
          select: { id: true },
        });
        if (!accepted) throw new Error('Accepted document is no longer available');
        return accepted;
      }
      const claimed = await tx.documentUploadIntent.updateMany({
        where: { id, status: 'UPLOADING', expiresAt: { gt: now() } },
        data: { status: 'FINALIZED', leaseToken: null, leaseUntil: null, lastError: null },
      });
      if (claimed.count !== 1) throw new Error('Upload intent expired or cancelled');
      const doc = await tx.document.create({
        data: {
          id,
          workspaceId: intent.workspaceId,
          filename: intent.filename,
          mimeType: intent.mimeType,
          sizeBytes: intent.sizeBytes,
          storageKey: intent.storageKey,
          lifecycle: 'ACTIVE',
          processingStatus: 'PENDING',
        },
        select: { id: true },
      });
      await tx.documentTask.create({
        data: {
          id: parseTaskId(id),
          documentId: id,
          workspaceId: intent.workspaceId,
          storageKey: intent.storageKey,
          kind: 'PARSE',
        },
      });
      return doc;
    });
  }

  async function abandonDocumentUpload(id: string, objectMayExist = true): Promise<void> {
    // Never clean up a FINALIZED intent, including an ambiguous successful commit.
    await db.documentUploadIntent.updateMany({
      where: { id, status: 'UPLOADING' },
      // A conditional PUT rejected with 412 never owned the existing object.
      data: { status: objectMayExist ? 'CLEANUP' : 'DONE' },
    });
  }

  async function requestDocumentDeletion(id: string, workspaceId: string): Promise<boolean> {
    return db.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({ where: { id, workspaceId } });
      if (!doc) {
        const receipt = await tx.documentTask.findFirst({
          where: { id: deleteTaskId(id), workspaceId, kind: 'DELETE' },
          select: { id: true },
        });
        return !!receipt;
      }
      // This row lock serializes deletion with the parser's guarded publication.
      await tx.document.updateMany({
        where: { id, workspaceId },
        data: { lifecycle: 'DELETING', parseLeaseToken: null, parseLeaseUntil: null },
      });
      await tx.documentTask.updateMany({
        where: { documentId: id, kind: 'PARSE', status: { not: 'DONE' } },
        data: { status: 'DONE', leaseToken: null, leaseUntil: null },
      });
      await tx.documentTask.upsert({
        where: { id: deleteTaskId(id) },
        create: {
          id: deleteTaskId(id),
          documentId: id,
          workspaceId,
          storageKey: doc.storageKey,
          kind: 'DELETE',
        },
        update: {},
      });
      return true;
    });
  }

  return {
    beginDocumentUpload,
    finalizeDocumentUpload,
    getAcceptedDocumentUpload,
    abandonDocumentUpload,
    requestDocumentDeletion,
  };
}

export const {
  beginDocumentUpload,
  finalizeDocumentUpload,
  getAcceptedDocumentUpload,
  abandonDocumentUpload,
  requestDocumentDeletion,
} = createDocumentLifecycle(prisma);

export const newDocumentLeaseToken = (): string => randomUUID();
