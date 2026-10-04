'use server';

import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { deleteDocument } from '@/server/services/document';

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
