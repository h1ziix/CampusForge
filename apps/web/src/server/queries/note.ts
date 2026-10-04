import { prisma } from '@campusforge/db';

/**
 * Serializable note shape returned from queries.
 * Dates are converted to ISO strings for safe server→client transfer.
 */
export interface NoteRow {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight note shape for list views (no full content).
 */
export interface NoteListItem {
  id: string;
  title: string;
  excerpt: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

const EXCERPT_LENGTH = 120;

/**
 * Get all notes for a workspace, newest first.
 * Returns list items with a short excerpt instead of full content.
 */
export async function getWorkspaceNotes(workspaceId: string): Promise<NoteListItem[]> {
  const notes = await prisma.note.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      content: true,
      sourceType: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    excerpt:
      n.content.length > EXCERPT_LENGTH
        ? n.content.slice(0, EXCERPT_LENGTH).trimEnd() + '...'
        : n.content,
    sourceType: n.sourceType,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
}

/**
 * Get a single note by ID within a workspace.
 * Returns null if not found or doesn't belong to the workspace.
 */
export async function getNoteById(noteId: string, workspaceId: string): Promise<NoteRow | null> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, workspaceId },
  });

  if (!note) return null;

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    sourceType: note.sourceType,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Get the total note count for a workspace (used on the dashboard).
 */
export async function getNoteCount(workspaceId: string): Promise<number> {
  return prisma.note.count({ where: { workspaceId } });
}

/**
 * Get the most recently updated notes (used on the dashboard).
 */
export async function getRecentNotes(workspaceId: string, limit = 3): Promise<NoteListItem[]> {
  const notes = await prisma.note.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      content: true,
      sourceType: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    excerpt:
      n.content.length > EXCERPT_LENGTH
        ? n.content.slice(0, EXCERPT_LENGTH).trimEnd() + '...'
        : n.content,
    sourceType: n.sourceType,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
}
