'use server';

import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { deleteDocument } from '@/server/services/document';
import { getDocumentGenerationState } from '@/server/queries/document-state';
import type { DocumentGenerationState } from '@/server/queries/document';

/** Read-only status check: never queues, retries, or invokes a paid provider. */
export async function getDocumentGenerationStateAction(
  formData: FormData,
): Promise<ActionResult<DocumentGenerationState>> {
  const user = await requireAuth();
  const documentId = formData.get('documentId');
  const workspaceId = formData.get('workspaceId');
  if (typeof documentId !== 'string' || !documentId || documentId.length > 128)
    return err('Document ID is required');
  if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 128)
    return err('Workspace ID is required');
  await requireWorkspaceMember(user.id, workspaceId);
  try {
    const state = await getDocumentGenerationState(documentId, workspaceId);
    return state ? ok(state) : err('Document not found. It may have been deleted.');
  } catch {
    console.error('[CampusForge] Document state could not be read.');
    return err('Could not check saved status. Please check again. No new generation was started.');
  }
}

/**
 * Delete a document from a CampusForge workspace.
 *
 * 1. Check auth
 * 2. Check workspace membership
 * 3. Call deleteDocument service (removes S3 object + DB record)
 */
export async function deleteDocumentAction(
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  const user = await requireAuth();

  const documentId = formData.get('documentId');
  const workspaceId = formData.get('workspaceId');

  if (!documentId || typeof documentId !== 'string') {
    return err('Document ID is required');
  }
  if (!workspaceId || typeof workspaceId !== 'string') {
    return err('Workspace ID is required');
  }

  await requireWorkspaceMember(user.id, workspaceId);

  try {
    const result = await deleteDocument(documentId, workspaceId);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ documentId: result.documentId });
  } catch (error) {
    console.error('[CampusForge] Delete document error:', error);
    return err('Failed to delete document. Please try again.');
  }
}
