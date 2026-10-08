'use server';

import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { enqueueSummaryGeneration } from '@/lib/queue';
import { prisma } from '@campusforge/db';

/**
 * Trigger AI summary generation for a document.
 *
 * Preconditions:
 * - User must be authenticated and a member of the workspace
 * - Document must exist and have completed parsing (parsedText present)
 * - No in-flight summary job should already exist for this document
 */
export async function generateSummaryAction(
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
    // Verify document exists, belongs to workspace, and has parsed text
    const doc = await prisma.document.findFirst({
      where: { id: documentId, workspaceId, lifecycle: 'ACTIVE' },
      select: {
        id: true,
        parsedText: true,
        processingStatus: true,
        summaryJson: true,
      },
    });

    if (!doc) {
      return err('Document not found');
    }

    if (doc.processingStatus !== 'COMPLETED') {
      return err('Document is still being processed. Please wait for parsing to complete.');
    }

    if (!doc.parsedText || doc.parsedText.trim().length === 0) {
      return err('Document has no text content to summarize.');
    }

    // Check for in-flight summary job (PENDING or PROCESSING)
    const existingJob = await prisma.aIJob.findFirst({
      where: {
        documentId,
        type: 'SUMMARY',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingJob) {
      return err('A summary is already being generated for this document.');
    }

    // Enqueue the summary generation job
    await enqueueSummaryGeneration({
      documentId,
      workspaceId,
      userId: user.id,
    });

    return ok({ documentId });
  } catch (error) {
    console.error('[CampusForge] Generate summary error:', error);
    return err('Failed to start summary generation. Please try again.');
  }
}
