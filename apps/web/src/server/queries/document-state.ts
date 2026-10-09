import { getDocumentById, type DocumentGenerationState } from '@/server/queries/document';
import { getDocumentSummary, getLatestAIJob } from '@/server/queries/summary';
import { getFlashcardSetsForDocument } from '@/server/queries/flashcard';

/** Call only after authentication and workspace membership have been checked. */
export async function getDocumentGenerationState(
  documentId: string,
  workspaceId: string,
): Promise<DocumentGenerationState | null> {
  const document = await getDocumentById(documentId, workspaceId);
  if (!document) return null;
  // A worker publishes its artifact and COMPLETED receipt in one transaction.
  // Observe receipts first: subsequent artifact reads cannot see the old
  // pre-commit snapshot while the UI sees a completed job and stops polling.
  const [summaryJob, flashcardJob] = await Promise.all([
    getLatestAIJob(documentId, 'SUMMARY', workspaceId),
    getLatestAIJob(documentId, 'FLASHCARD', workspaceId),
  ]);
  const [summary, flashcardSets] = await Promise.all([
    getDocumentSummary(documentId, workspaceId),
    getFlashcardSetsForDocument(documentId, workspaceId),
  ]);
  return {
    document: { ...document, hasSummary: summary !== null },
    summary,
    summaryJob,
    flashcardSets,
    flashcardJob,
  };
}
