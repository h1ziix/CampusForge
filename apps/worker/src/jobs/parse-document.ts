import {
  prisma,
  PARSE_LEASE_MS,
  PARSE_MAX_ATTEMPTS,
  newDocumentLeaseToken,
  parseTaskId,
  type PrismaClient,
} from '@campusforge/db';
import { getFromS3 } from '../lib/s3';
import { extractPdfText } from '../lib/pdf';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export interface DocumentProcessorOptions {
  db: PrismaClient;
  getObject: (key: string, signal: AbortSignal) => Promise<AsyncIterable<Uint8Array> | undefined>;
  parsePdf: (buffer: Buffer, signal?: AbortSignal) => Promise<string>;
  now?: () => Date;
  timeoutMs?: number;
  leaseMs?: number;
}

async function streamToBuffer(
  stream: AsyncIterable<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
) {
  const body = stream as AsyncIterable<Uint8Array> & { destroy?: (error?: Error) => void };
  const abort = () => body.destroy?.(new Error('Document read deadline exceeded'));
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        body.destroy?.();
        throw new Error('Stored document exceeds its byte budget');
      }
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** DB leases, not the presence of a Redis job, determine who may publish. */
export function createDocumentProcessor(options: DocumentProcessorOptions) {
  const { db, getObject, parsePdf } = options;
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? PARSE_LEASE_MS;
  return async function processDocumentJob(documentId: string): Promise<void> {
    // Prisma omits undefined filters: malformed Redis payloads must never turn
    // an ID-scoped claim into an update of every active pending document.
    if (typeof documentId !== 'string' || !documentId || documentId.length > 128) {
      throw new Error('Invalid document parse identity');
    }
    const at = now();
    const token = newDocumentLeaseToken();
    const claimed = await db.document.updateMany({
      where: {
        id: documentId,
        lifecycle: 'ACTIVE',
        parseAttempts: { lt: PARSE_MAX_ATTEMPTS },
        parseNextAttemptAt: { lte: at },
        OR: [
          { processingStatus: { in: ['PENDING', 'FAILED'] } },
          {
            processingStatus: 'PROCESSING',
            OR: [{ parseLeaseUntil: null }, { parseLeaseUntil: { lte: at } }],
          },
        ],
      },
      data: {
        processingStatus: 'PROCESSING',
        parseLeaseToken: token,
        parseLeaseUntil: new Date(at.getTime() + leaseMs),
        parseAttempts: { increment: 1 },
        parseError: null,
      },
    });
    if (claimed.count !== 1) {
      const doc = await db.document.findUnique({ where: { id: documentId } });
      if (
        !doc ||
        doc.lifecycle !== 'ACTIVE' ||
        doc.processingStatus === 'COMPLETED' ||
        (doc.processingStatus === 'FAILED' && doc.parseAttempts >= PARSE_MAX_ATTEMPTS)
      ) {
        await db.documentTask.updateMany({
          where: { id: parseTaskId(documentId), status: { not: 'DONE' } },
          data: { status: 'DONE', leaseToken: null, leaseUntil: null },
        });
      }
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
    let renewing = false;
    const heartbeat = setInterval(
      () => {
        if (renewing || controller.signal.aborted) return;
        renewing = true;
        db.document
          .updateMany({
            where: {
              id: documentId,
              lifecycle: 'ACTIVE',
              parseLeaseToken: token,
              parseLeaseUntil: { gt: now() },
            },
            data: { parseLeaseUntil: new Date(now().getTime() + leaseMs) },
          })
          .then((renewed) => {
            if (renewed.count !== 1) controller.abort();
          })
          .catch(() => controller.abort())
          .finally(() => {
            renewing = false;
          });
      },
      Math.max(10, Math.floor(leaseMs / 3)),
    );
    heartbeat.unref();
    timeout.unref();
    try {
      const doc = await db.document.findFirst({
        where: { id: documentId, lifecycle: 'ACTIVE', parseLeaseToken: token },
      });
      if (!doc) return;
      const body = await getObject(doc.storageKey, controller.signal);
      if (!body) throw new Error('Stored document returned no body');
      const buffer = await streamToBuffer(
        body,
        Math.min(doc.sizeBytes, MAX_DOCUMENT_BYTES),
        controller.signal,
      );
      if (buffer.byteLength !== doc.sizeBytes)
        throw new Error('Stored document size does not match its record');
      let parsedText: string;
      if (doc.mimeType === 'application/pdf')
        parsedText = await parsePdf(buffer, controller.signal);
      else if (doc.mimeType === 'text/plain' || doc.mimeType === 'text/markdown')
        parsedText = buffer.toString('utf-8');
      else throw new Error('Unsupported persisted document type');
      controller.signal.throwIfAborted();
      await db.$transaction(async (tx) => {
        const published = await tx.document.updateMany({
          where: {
            id: documentId,
            lifecycle: 'ACTIVE',
            parseLeaseToken: token,
            parseLeaseUntil: { gt: now() },
          },
          data: {
            parsedText,
            processingStatus: 'COMPLETED',
            parseLeaseToken: null,
            parseLeaseUntil: null,
            parseError: null,
          },
        });
        if (published.count === 1)
          await tx.documentTask.updateMany({
            where: { id: parseTaskId(documentId), kind: 'PARSE' },
            data: { status: 'DONE', leaseToken: null, leaseUntil: null, lastError: null },
          });
      });
    } catch (error) {
      await db.$transaction(async (tx) => {
        const doc = await tx.document.findFirst({
          where: { id: documentId, lifecycle: 'ACTIVE', parseLeaseToken: token },
        });
        if (!doc) return;
        const retryAt = new Date(
          now().getTime() + Math.min(300_000, 5000 * 2 ** doc.parseAttempts),
        );
        const terminal = doc.parseAttempts >= PARSE_MAX_ATTEMPTS;
        const failed = await tx.document.updateMany({
          where: { id: documentId, lifecycle: 'ACTIVE', parseLeaseToken: token },
          data: {
            processingStatus: 'FAILED',
            parseLeaseToken: null,
            parseLeaseUntil: null,
            parseNextAttemptAt: retryAt,
            parseError: terminal
              ? 'Document parsing failed after five attempts.'
              : 'Document parsing failed. Retry is automatic.',
          },
        });
        if (failed.count === 1)
          await tx.documentTask.updateMany({
            where: { id: parseTaskId(documentId), kind: 'PARSE' },
            data: {
              status: terminal ? 'DONE' : 'PENDING',
              availableAt: retryAt,
              leaseToken: null,
              leaseUntil: null,
              lastError: 'Document parsing attempt failed',
            },
          });
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
    }
  };
}

export const processDocumentJob = createDocumentProcessor({
  db: prisma,
  getObject: async (key, signal) =>
    (await getFromS3(key, signal)) as AsyncIterable<Uint8Array> | undefined,
  parsePdf: extractPdfText,
});
