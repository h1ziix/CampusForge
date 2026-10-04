import { prisma } from '@campusforge/db';

// ─── Types ──────────────────────────────────────────────────

/** Summary section shape stored in summaryJson. */
export interface SummarySectionRow {
  heading: string;
  content: string;
}

/** Parsed summaryJson from the database. */
export interface DocumentSummaryRow {
  title: string;
  tldr: string;
  sections: SummarySectionRow[];
  keyTerms: string[];
}

/** AI job status for display. */
export interface AIJobRow {
  id: string;
  type: string;
  status: string;
  tokenUsage: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Queries ────────────────────────────────────────────────

/**
 * Get the summary for a document (if it exists).
 * Returns null if no summary has been generated yet.
 */
export async function getDocumentSummary(
  documentId: string,
  workspaceId: string,
): Promise<DocumentSummaryRow | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { summaryJson: true },
  });

  if (!doc?.summaryJson) return null;

  // summaryJson is stored as Prisma Json — cast to our known shape
  return doc.summaryJson as unknown as DocumentSummaryRow;
}

/**
 * Get the latest AI job for a document of a given type.
 * Used to show job status (pending, processing, completed, failed).
 */
export async function getLatestAIJob(
  documentId: string,
  jobType: string,
): Promise<AIJobRow | null> {
  const job = await prisma.aIJob.findFirst({
    where: { documentId, type: jobType as never },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      status: true,
      tokenUsage: true,
      estimatedCost: true,
      latencyMs: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job) return null;

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    tokenUsage: job.tokenUsage,
    estimatedCost: job.estimatedCost,
    latencyMs: job.latencyMs,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
