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
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Historical/raw transport errors are never returned to browsers. */
function publicJobError(status: string, code: string | null): string | null {
  if (status === 'UNCERTAIN')
    return 'The provider outcome is unknown. Automatic paid regeneration is stopped; check this operation manually.';
  const messages: Record<string, string> = {
    INPUT_BUDGET_EXCEEDED: 'The complete source exceeds the configured AI input budget.',
    INVALID_CONFIGURATION: 'The AI provider is not configured for this operation.',
    UNKNOWN_MODEL: 'The configured model has no approved pricing policy.',
    PROVIDER_AUTH: 'The AI provider rejected its server credentials.',
    PROVIDER_RATE_LIMIT: 'The AI provider rate limit was reached.',
    PROVIDER_TIMEOUT: 'The AI provider timed out.',
    PROVIDER_NETWORK: 'The AI provider could not be reached.',
    PROVIDER_ABORTED: 'The AI request was interrupted.',
    INVALID_JSON: 'The AI response was not valid JSON.',
    INVALID_OUTPUT: 'The AI response did not meet the study material format.',
    OUTPUT_VALIDATION_FAILED: 'The AI response did not meet the study material format.',
    OUTPUT_BUDGET_EXCEEDED: 'The AI response exceeded the configured output budget.',
    PROVIDER_PARTIAL_RESPONSE: 'The AI provider returned an incomplete response.',
    PROVIDER_EMPTY_RESPONSE: 'The AI provider returned no study material.',
    RESULT_PERSISTENCE_FAILED: 'The AI result could not be confirmed in saved storage.',
    OPERATION_DEADLINE_EXCEEDED: 'The operation reached its time limit.',
    DOCUMENT_DELETED: 'The source document was deleted.',
  };
  if (code && Object.hasOwn(messages, code)) return messages[code]!;
  if (status === 'FAILED')
    return 'Generation failed. No successful result was confirmed for this operation.';
  if (status === 'CANCELLED') return 'Generation was cancelled.';
  return null;
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
    where: { id: documentId, workspaceId, lifecycle: 'ACTIVE' },
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
  jobType: 'SUMMARY' | 'FLASHCARD',
  workspaceId: string,
): Promise<AIJobRow | null> {
  const job = await prisma.aIJob.findFirst({
    where: {
      documentId,
      workspaceId,
      type: jobType,
      document: { is: { workspaceId, lifecycle: 'ACTIVE' } },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      status: true,
      tokenUsage: true,
      estimatedCost: true,
      latencyMs: true,
      errorMessage: true,
      idempotencyKey: true,
      attemptCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      finishedAt: true,
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
    errorMessage: publicJobError(job.status, job.errorMessage),
    idempotencyKey: job.idempotencyKey,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
