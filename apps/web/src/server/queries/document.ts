import { prisma, Prisma, PARSE_MAX_ATTEMPTS } from '@campusforge/db';
import { getDocumentAIInput, type DocumentAIInput } from '@/server/services/ai-input';
import type { DocumentSummaryRow, AIJobRow } from '@/server/queries/summary';
import type { FlashcardSetListRow } from '@/server/queries/flashcard';

/**
 * Serializable document shape returned from queries.
 * Dates are converted to ISO strings for safe server→client transfer.
 */
export interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: string;
  hasSummary: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public detail DTO. Raw source text is measured only on the server.
 */
export interface DocumentDetail extends DocumentRow {
  parseError: string | null;
  parseAttempts: number;
  parseMaxAttempts: number;
  parseNextAttemptAt: string | null;
  parseRetryScheduled: boolean;
  aiInput: DocumentAIInput;
}

export interface DocumentGenerationState {
  document: DocumentDetail;
  summary: DocumentSummaryRow | null;
  summaryJob: AIJobRow | null;
  flashcardSets: FlashcardSetListRow[];
  flashcardJob: AIJobRow | null;
}

const metadataSelect = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  processingStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

type MetadataDocument = Prisma.DocumentGetPayload<{ select: typeof metadataSelect }>;
const metadataRow = (document: MetadataDocument, hasSummary: boolean): DocumentRow => ({
  id: document.id,
  filename: document.filename,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  processingStatus: document.processingStatus,
  hasSummary,
  createdAt: document.createdAt.toISOString(),
  updatedAt: document.updatedAt.toISOString(),
});

/** Read presence without fetching summary JSON in metadata lists. */
async function documentsWithSummary(workspaceId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const documents = await prisma.document.findMany({
    where: {
      workspaceId,
      lifecycle: 'ACTIVE',
      id: { in: ids },
      summaryJson: { not: Prisma.DbNull },
    },
    select: { id: true },
  });
  return new Set(documents.map((document) => document.id));
}

/**
 * Get all documents for a workspace, newest first.
 * Used on the documents list page.
 */
export async function getWorkspaceDocuments(workspaceId: string): Promise<DocumentRow[]> {
  const docs = await prisma.document.findMany({
    where: { workspaceId, lifecycle: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: metadataSelect,
  });
  const summaries = await documentsWithSummary(
    workspaceId,
    docs.map((document) => document.id),
  );
  return docs.map((document) => metadataRow(document, summaries.has(document.id)));
}

/**
 * Get a single document by ID within a workspace.
 * Returns null if not found or doesn't belong to the workspace.
 */
export async function getDocumentById(
  documentId: string,
  workspaceId: string,
): Promise<DocumentDetail | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId, lifecycle: 'ACTIVE' },
    select: { ...metadataSelect, parsedText: true, parseAttempts: true, parseNextAttemptAt: true },
  });

  if (!doc) return null;

  const summaries = await documentsWithSummary(workspaceId, [doc.id]);
  const retry = doc.processingStatus === 'FAILED' && doc.parseAttempts < PARSE_MAX_ATTEMPTS;
  return {
    ...metadataRow(doc, summaries.has(doc.id)),
    parseError:
      doc.processingStatus !== 'FAILED'
        ? null
        : retry
          ? 'Text extraction failed. A server retry is scheduled.'
          : 'Text extraction failed after the configured retry limit.',
    parseAttempts: doc.parseAttempts,
    parseMaxAttempts: PARSE_MAX_ATTEMPTS,
    parseNextAttemptAt: retry ? doc.parseNextAttemptAt.toISOString() : null,
    parseRetryScheduled: retry,
    aiInput: getDocumentAIInput(doc),
  };
}

/**
 * Get the total document count for a workspace (used on the dashboard).
 */
export async function getDocumentCount(workspaceId: string): Promise<number> {
  return prisma.document.count({ where: { workspaceId, lifecycle: 'ACTIVE' } });
}

/**
 * Get the most recently uploaded documents (used on the dashboard).
 */
export async function getRecentDocuments(workspaceId: string, limit = 3): Promise<DocumentRow[]> {
  const docs = await prisma.document.findMany({
    where: { workspaceId, lifecycle: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: metadataSelect,
  });
  const summaries = await documentsWithSummary(
    workspaceId,
    docs.map((document) => document.id),
  );
  return docs.map((document) => metadataRow(document, summaries.has(document.id)));
}
