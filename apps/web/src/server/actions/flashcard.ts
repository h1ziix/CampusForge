'use server';

import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { requestGeneration, type GenerationReceipt } from '@/server/services/ai-generation';
import { prisma } from '@campusforge/db';

/**
 * Trigger AI flashcard generation for a document.
 *
 * Preconditions:
 * - User must be authenticated and a member of the workspace
 * - Document must exist and have completed parsing (parsedText present)
 * - Required client idempotency key identifies one durable logical operation
 */
export async function generateFlashcardsAction(
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

  return requestGeneration(user.id, 'FLASHCARD', formData);
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
