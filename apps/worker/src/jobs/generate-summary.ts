/**
 * CampusForge Worker — Document summary generation job processor.
 *
 * Takes a document that has already been parsed (has parsedText),
 * sends it through the AI summary pipeline, and persists the result.
 *
 * Flow:
 * 1. Create AIJob record (PENDING)
 * 2. Mark AIJob as PROCESSING
 * 3. Call AI provider with summary prompt
 * 4. Persist summaryJson on Document + outputJson on AIJob
 * 5. Mark AIJob as COMPLETED with latency/token metadata
 *
 * Error handling:
 * - Sets AIJob status to FAILED with errorMessage
 * - Re-throws so BullMQ can retry (up to configured attempts)
 */
import { prisma } from '@campusforge/db';
import { assertDocumentGenerationPayload } from '../lib/document-job';
import {
  getAIProvider,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  parseSummaryOutput,
} from '@campusforge/ai';

export interface SummaryJobData {
  documentId: string;
  workspaceId: string;
  userId: string;
}

export async function processSummaryJob(data: SummaryJobData): Promise<void> {
  assertDocumentGenerationPayload(data);
  const { documentId, workspaceId, userId } = data;

  // Jobs already in Redis cannot resurrect a deleted source. DB determines scope.
  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId, lifecycle: 'ACTIVE', processingStatus: 'COMPLETED' },
    select: { parsedText: true, filename: true },
  });
  if (!doc) return;

  // 1. Create AIJob record
  const aiJob = await prisma.aIJob.create({
    data: {
      type: 'SUMMARY',
      status: 'PENDING',
      documentId,
      workspaceId,
      userId,
    },
  });

  try {
    // 2. Mark PROCESSING
    await prisma.aIJob.update({
      where: { id: aiJob.id },
      data: { status: 'PROCESSING' },
    });

    // 3. Fetch document with parsed text
    if (!doc.parsedText || doc.parsedText.trim().length === 0) {
      throw new Error(
        `Document ${documentId} has no parsed text. Parse must complete before summarization.`,
      );
    }

    // 4. Call AI provider
    const provider = getAIProvider();
    const result = await provider.completeJSON({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt: buildSummaryUserPrompt(doc.parsedText, doc.filename),
      parse: parseSummaryOutput,
    });

    // 5. Persist results
    // Cast to satisfy Prisma's JSON field typing (InputJsonValue)
    const summaryData = JSON.parse(JSON.stringify(result.data));

    await prisma.$transaction(async (tx) => {
      // Store structured summary on the document
      const published = await tx.document.updateMany({
        where: { id: documentId, workspaceId, lifecycle: 'ACTIVE', processingStatus: 'COMPLETED' },
        data: { summaryJson: summaryData },
      });
      if (!published.count) throw new Error('Source document is no longer available');
      // Store output + metadata on the AIJob
      await tx.aIJob.update({
        where: { id: aiJob.id },
        data: {
          status: 'COMPLETED',
          outputJson: summaryData,
          tokenUsage: result.meta.totalTokens,
          estimatedCost: result.meta.estimatedCost,
          latencyMs: result.meta.latencyMs,
        },
      });
    });

    console.log(
      `[CampusForge Worker] Summary generated for "${doc.filename}" — ` +
        `${result.meta.totalTokens} tokens, ${result.meta.latencyMs}ms`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `[CampusForge Worker] Summary generation failed for document ${documentId}:`,
      error,
    );

    // Mark AIJob as FAILED
    await prisma.aIJob
      .update({
        where: { id: aiJob.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      })
      .catch((updateErr) => {
        console.error('[CampusForge Worker] Failed to update AIJob status to FAILED:', updateErr);
      });

    // Re-throw so BullMQ can retry
    throw error;
  }
}
