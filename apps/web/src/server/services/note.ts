import { prisma } from '@campusforge/db';
import type { CreateNoteInput, UpdateNoteInput } from '@campusforge/shared';

type NoteResult = { ok: true; noteId: string } | { ok: false; error: string };

/**
 * Create a new note in a CampusForge workspace.
 * sourceType defaults to MANUAL for user-created notes.
 */
export async function createNote(input: CreateNoteInput): Promise<NoteResult> {
  const title = input.title.trim();

  if (!title) {
    return { ok: false, error: 'Note title is required' };
  }

  const note = await prisma.note.create({
    data: {
      title,
      content: input.content ?? '',
      sourceType: 'MANUAL',
      workspaceId: input.workspaceId,
    },
    select: { id: true },
  });

  return { ok: true, noteId: note.id };
}

/**
 * Update an existing note.
 * Verifies the note belongs to the given workspace.
 * Only updates fields that are explicitly provided.
 */
export async function updateNote(input: UpdateNoteInput, workspaceId: string): Promise<NoteResult> {
  const existing = await prisma.note.findFirst({
    where: { id: input.id, workspaceId },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false, error: 'Note not found' };
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.content !== undefined) data.content = input.content;

  await prisma.note.update({
    where: { id: input.id },
    data,
  });

  return { ok: true, noteId: input.id };
}
