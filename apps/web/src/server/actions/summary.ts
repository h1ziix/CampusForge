'use server';

import { err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { requestGeneration, type GenerationReceipt } from '@/server/services/ai-generation';

/**
 * Trigger AI summary generation for a document.
 *
 * Preconditions:
 * - User must be authenticated and a member of the workspace
 * - Document must exist and have completed parsing (parsedText present)
 * - Required client idempotency key identifies one durable logical operation
 */
export async function generateSummaryAction(
  formData: FormData,
): Promise<ActionResult<GenerationReceipt>> {
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

  return requestGeneration(user.id, 'SUMMARY', formData);
}
