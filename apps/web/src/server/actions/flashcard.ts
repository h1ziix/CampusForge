'use server';

import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { enqueueFlashcardGeneration } from '@/lib/queue';
import { prisma } from '@campusforge/db';

/**
 * Trigger AI flashcard generation for a document.
 *
 * Preconditions:
 * - User must be authenticated and a member of the workspace
 * - Document must exist and have completed parsing (parsedText present)
 * - No in-flight flashcard job should already exist for this document
 */
export async function generateFlashcardsAction(
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
      },
    });

    if (!doc) {
      return err('Document not found');
    }

    if (doc.processingStatus !== 'COMPLETED') {
      return err('Document is still being processed. Please wait for parsing to complete.');
    }

    if (!doc.parsedText || doc.parsedText.trim().length === 0) {
      return err('Document has no text content to generate flashcards from.');
    }

    // Check for in-flight flashcard job (PENDING or PROCESSING)
    const existingJob = await prisma.aIJob.findFirst({
      where: {
        documentId,
        type: 'FLASHCARD',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingJob) {
      return err('Flashcards are already being generated for this document.');
    }

    // Enqueue the flashcard generation job
    await enqueueFlashcardGeneration({
      documentId,
      workspaceId,
      userId: user.id,
    });

    return ok({ documentId });
  } catch (error) {
    console.error('[CampusForge] Generate flashcards error:', error);
    return err('Failed to start flashcard generation. Please try again.');
  }
}

/**
 * Delete a flashcard set.
 *
 * Preconditions:
 * - User must be authenticated and a member of the workspace
 * - FlashcardSet must exist and belong to the workspace
 */
export async function deleteFlashcardSetAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAuth();

  const flashcardSetId = formData.get('flashcardSetId');
  const workspaceId = formData.get('workspaceId');

  if (!flashcardSetId || typeof flashcardSetId !== 'string') {
    return err('Flashcard set ID is required');
  }
  if (!workspaceId || typeof workspaceId !== 'string') {
    return err('Workspace ID is required');
  }

  await requireWorkspaceMember(user.id, workspaceId);

  try {
    const flashcardSet = await prisma.flashcardSet.findFirst({
      where: { id: flashcardSetId, workspaceId },
      select: { id: true },
    });

    if (!flashcardSet) {
      return err('Flashcard set not found');
    }

    await prisma.flashcardSet.delete({
      where: { id: flashcardSetId },
    });

    return ok({ id: flashcardSetId });
  } catch (error) {
    console.error('[CampusForge] Delete flashcard set error:', error);
    return err('Failed to delete flashcard set. Please try again.');
  }
}
