import { prisma } from '@campusforge/db';
import { uploadToS3, deleteFromS3 } from '@/lib/s3';
import { enqueueDocumentParsing } from '@/lib/queue';

type DocumentResult = { ok: true; documentId: string } | { ok: false; error: string };

/**
 * Create a document record, upload its file to S3, and enqueue parsing.
 *
 * Responsibility chain:
 * 1. Generate a unique storage key
 * 2. Upload binary to S3/MinIO
 * 3. Create DB record with PENDING status
 * 4. Enqueue background job for text extraction
 *
 * If S3 upload fails, no DB record is created.
 * If DB insert fails after S3 upload, the orphaned S3 object is cleaned up.
 * If queue enqueue fails, the document stays PENDING (can be retried).
 */
export async function createDocument(input: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  fileBuffer: Buffer;
}): Promise<DocumentResult> {
  // Deterministic, collision-resistant storage key
  const timestamp = Date.now();
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `documents/${input.workspaceId}/${timestamp}-${safeFilename}`;

  // 1. Upload to S3
  try {
    await uploadToS3(storageKey, input.fileBuffer, input.mimeType);
  } catch (error) {
    console.error('[CampusForge] S3 upload failed:', error);
    return { ok: false, error: 'File upload failed. Please try again.' };
  }

  // 2. Create DB record
  let documentId: string;
  try {
    const doc = await prisma.document.create({
      data: {
        workspaceId: input.workspaceId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey,
        processingStatus: 'PENDING',
      },
      select: { id: true },
    });
    documentId = doc.id;
  } catch (error) {
    // Cleanup orphaned S3 object
    console.error('[CampusForge] DB insert failed, cleaning up S3:', error);
    await deleteFromS3(storageKey).catch(() => {});
    return { ok: false, error: 'Failed to save document record.' };
  }

  // 3. Enqueue parsing job
  try {
    await enqueueDocumentParsing(documentId);
  } catch (error) {
    // Non-fatal: document stays PENDING, can be retried manually or by a cron
    console.error('[CampusForge] Failed to enqueue parsing job:', error);
  }

  return { ok: true, documentId };
}

/**
 * Delete a document: remove from S3 and delete the DB record.
 * Verifies the document belongs to the given workspace.
 */
export async function deleteDocument(
  documentId: string,
  workspaceId: string,
): Promise<DocumentResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true, storageKey: true },
  });

  if (!doc) {
    return { ok: false, error: 'Document not found' };
  }

  // Delete from S3 (best-effort — don't block DB delete on S3 failure)
  await deleteFromS3(doc.storageKey).catch((error) => {
    console.error('[CampusForge] S3 delete failed (non-blocking):', error);
  });

  await prisma.document.delete({
    where: { id: documentId },
  });

  return { ok: true, documentId };
}

/**
 * Update the processing status of a document.
 * Called by the background worker after parsing completes or fails.
 */
export async function updateDocumentProcessingStatus(
  documentId: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  parsedText?: string | null,
): Promise<void> {
  const data: Record<string, unknown> = { processingStatus: status };
  if (parsedText !== undefined) {
    data.parsedText = parsedText;
  }

  await prisma.document.update({
    where: { id: documentId },
    data,
  });
}
