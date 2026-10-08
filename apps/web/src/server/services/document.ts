import { randomUUID } from 'node:crypto';
import {
  beginDocumentUpload,
  finalizeDocumentUpload,
  getAcceptedDocumentUpload,
  abandonDocumentUpload,
  requestDocumentDeletion,
} from '@campusforge/db';
import { MAX_DOCUMENT_SIZE_BYTES } from '@campusforge/shared';
import { documentStorageKey, isS3ObjectAlreadyPresent, uploadToS3 } from '@/lib/s3';

type DocumentResult = { ok: true; documentId: string } | { ok: false; error: string };

/**
 * Persist ownership before S3, then atomically accept the document and parsing task.
 * Failed/ambiguous PUTs retain a cleanup ledger; Redis availability is irrelevant
 * to HTTP acceptance. No network calls run inside the acceptance transaction.
 */
export async function createDocument(input: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  fileBuffer: Buffer;
}): Promise<DocumentResult> {
  if (
    input.fileBuffer.byteLength !== input.sizeBytes ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_DOCUMENT_SIZE_BYTES
  ) {
    return { ok: false, error: 'Invalid document size.' };
  }
  const id = randomUUID();
  const storageKey = documentStorageKey(input.workspaceId, id);
  try {
    await beginDocumentUpload({
      id,
      storageKey,
      workspaceId: input.workspaceId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
  } catch {
    // No PUT has occurred. An ambiguously persisted intent will safely expire.
    console.error('[CampusForge] Could not persist document upload intent.');
    return { ok: false, error: 'Failed to prepare document upload. Please try again.' };
  }

  try {
    await uploadToS3(storageKey, input.fileBuffer, input.mimeType, input.filename, id);
  } catch (error) {
    // A 412 never created an object. Other transport failures may have committed
    // a PUT; deferred cleanup verifies the object's immutable ownership metadata.
    await abandonDocumentUpload(id, !isS3ObjectAlreadyPresent(error)).catch(() => {
      console.error('[CampusForge] Upload intent will require expiry recovery.');
    });
    console.error('[CampusForge] Document object upload failed.');
    return { ok: false, error: 'File upload failed. Please try again.' };
  }

  try {
    const document = await finalizeDocumentUpload(id);
    return { ok: true, documentId: document.id };
  } catch {
    // A lost DB response does not prove rollback. Check persisted acceptance,
    // and never clean up a FINALIZED intent even if this check is unavailable.
    const accepted = await getAcceptedDocumentUpload(id).catch(() => null);
    if (accepted) return { ok: true, documentId: accepted.id };
    await abandonDocumentUpload(id).catch(() => {
      console.error('[CampusForge] Upload intent will require expiry recovery.');
    });
    console.error('[CampusForge] Document acceptance could not be confirmed.');
    return {
      ok: false,
      error: 'Failed to confirm document upload. Please refresh before retrying.',
    };
  }
}

/** Hide the document immediately and durably schedule object/DB cleanup. */
export async function deleteDocument(
  documentId: string,
  workspaceId: string,
): Promise<DocumentResult> {
  const accepted = await requestDocumentDeletion(documentId, workspaceId);
  return accepted ? { ok: true, documentId } : { ok: false, error: 'Document not found' };
}
