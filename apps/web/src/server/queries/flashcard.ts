import { prisma } from '@campusforge/db';

// ─── Types ──────────────────────────────────────────────────

/** A single flashcard stored in cardsJson. */
export interface FlashcardCardRow {
  front: string;
  back: string;
}

/** FlashcardSet row for list views. */
export interface FlashcardSetListRow {
  id: string;
  title: string;
  cardCount: number;
  sourceDocumentId: string | null;
  sourceDocumentFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full FlashcardSet row with cards for detail view. */
export interface FlashcardSetDetailRow {
  id: string;
  title: string;
  cardCount: number;
  cards: FlashcardCardRow[];
  sourceDocumentId: string | null;
  sourceDocumentFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Queries ────────────────────────────────────────────────

/**
 * Get all flashcard sets for a workspace, ordered by creation date (newest first).
 */
export async function getWorkspaceFlashcardSets(
  workspaceId: string,
): Promise<FlashcardSetListRow[]> {
  const sets = await prisma.flashcardSet.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      cardCount: true,
      sourceDocumentId: true,
      sourceDocument: {
        select: { filename: true, lifecycle: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    cardCount: s.cardCount,
    sourceDocumentId: s.sourceDocument?.lifecycle === 'ACTIVE' ? s.sourceDocumentId : null,
    sourceDocumentFilename:
      s.sourceDocument?.lifecycle === 'ACTIVE' ? s.sourceDocument.filename : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

/**
 * Get a single flashcard set by ID with all cards.
 * Returns null if not found or doesn't belong to workspace.
 */
export async function getFlashcardSetById(
  flashcardSetId: string,
  workspaceId: string,
): Promise<FlashcardSetDetailRow | null> {
  const set = await prisma.flashcardSet.findFirst({
    where: { id: flashcardSetId, workspaceId },
    select: {
      id: true,
      title: true,
      cardCount: true,
      cardsJson: true,
      sourceDocumentId: true,
      sourceDocument: {
        select: { filename: true, lifecycle: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!set) return null;

  return {
    id: set.id,
    title: set.title,
    cardCount: set.cardCount,
    cards: set.cardsJson as unknown as FlashcardCardRow[],
    sourceDocumentId: set.sourceDocument?.lifecycle === 'ACTIVE' ? set.sourceDocumentId : null,
    sourceDocumentFilename:
      set.sourceDocument?.lifecycle === 'ACTIVE' ? set.sourceDocument.filename : null,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}

/**
 * Get flashcard sets generated from a specific document.
 */
export async function getFlashcardSetsForDocument(
  documentId: string,
  workspaceId: string,
): Promise<FlashcardSetListRow[]> {
  const sets = await prisma.flashcardSet.findMany({
    where: {
      sourceDocumentId: documentId,
      workspaceId,
      sourceDocument: { is: { lifecycle: 'ACTIVE' } },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      cardCount: true,
      sourceDocumentId: true,
      sourceDocument: {
        select: { filename: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    cardCount: s.cardCount,
    sourceDocumentId: s.sourceDocumentId,
    sourceDocumentFilename: s.sourceDocument?.filename ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

/**
 * Get flashcard set count for a workspace.
 */
export async function getFlashcardSetCount(workspaceId: string): Promise<number> {
  return prisma.flashcardSet.count({
    where: { workspaceId },
  });
}
