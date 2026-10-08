import { prisma } from '@campusforge/db';

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
 * Extended document shape with parsed text (for detail view).
 */
export interface DocumentDetail extends DocumentRow {
  parsedText: string | null;
  storageKey: string;
}

/**
 * Get all documents for a workspace, newest first.
 * Used on the documents list page.
 */
export async function getWorkspaceDocuments(workspaceId: string): Promise<DocumentRow[]> {
  const docs = await prisma.document.findMany({
    where: { workspaceId, lifecycle: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

  return docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    processingStatus: d.processingStatus,
    hasSummary: !!(d as Record<string, unknown>).summaryJson,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
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
  });

  if (!doc) return null;

  return {
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    storageKey: doc.storageKey,
    parsedText: doc.parsedText,
    processingStatus: doc.processingStatus,
    hasSummary: !!(doc as Record<string, unknown>).summaryJson,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
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
  });

  return docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    processingStatus: d.processingStatus,
    hasSummary: !!(d as Record<string, unknown>).summaryJson,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}
