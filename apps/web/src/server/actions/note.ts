'use server';

import { createNoteSchema, updateNoteSchema } from '@campusforge/shared';
import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { createNote, updateNote } from '@/server/services/note';

/**
 * Create a note in a CampusForge workspace.
 *
 * 1. Validate input with Zod
 * 2. Check auth
 * 3. Check workspace membership
 * 4. Call createNote service
 * 5. Return the new note ID for redirect
 */
export async function createNoteAction(
  formData: FormData,
): Promise<ActionResult<{ noteId: string }>> {
  const user = await requireAuth();

  const raw = {
    title: formData.get('title'),
    content: formData.get('content') ?? '',
    workspaceId: formData.get('workspaceId'),
  };

  const parsed = createNoteSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  await requireWorkspaceMember(user.id, parsed.data.workspaceId);

  try {
    const result = await createNote(parsed.data);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ noteId: result.noteId });
  } catch (error) {
    console.error('[CampusForge] Create note error:', error);
    return err('Failed to create note. Please try again.');
  }
}

/**
 * Update an existing note in a CampusForge workspace.
 *
 * 1. Validate input with Zod
 * 2. Check auth
 * 3. Check workspace membership
 * 4. Call updateNote service
 */
export async function updateNoteAction(
  formData: FormData,
): Promise<ActionResult<{ noteId: string }>> {
  const user = await requireAuth();

  const workspaceId = formData.get('workspaceId');
  if (!workspaceId || typeof workspaceId !== 'string') {
    return err('Workspace ID is required');
  }

  const raw: Record<string, unknown> = {
    id: formData.get('id'),
  };

  const title = formData.get('title');
  if (title !== null) raw.title = title;

  const content = formData.get('content');
  if (content !== null) raw.content = content;

  const parsed = updateNoteSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  await requireWorkspaceMember(user.id, workspaceId);

  try {
    const result = await updateNote(parsed.data, workspaceId);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ noteId: result.noteId });
  } catch (error) {
    console.error('[CampusForge] Update note error:', error);
    return err('Failed to update note. Please try again.');
  }
}
