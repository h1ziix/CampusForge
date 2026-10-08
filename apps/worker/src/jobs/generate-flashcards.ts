/**
 * CampusForge Worker — Flashcard generation job processor.
 *
 * Takes a document that has already been parsed (has parsedText),
 * sends it through the AI flashcard pipeline, and persists the result
 * as a FlashcardSet record.
 *
 * If the document already has a summary (summaryJson), the pipeline
 * uses the summary for higher-quality flashcards. Otherwise it falls
 * back to raw parsedText.
 *
 * Flow:
 * 1. Create AIJob record (PENDING)
 * 2. Mark AIJob as PROCESSING
 * 3. Fetch document text (and summary if available)
 * 4. Call AI provider with flashcard prompt
 * 5. Persist FlashcardSet + update AIJob (COMPLETED)
 *
 * Error handling:
 * - Sets AIJob status to FAILED with errorMessage
 * - Re-throws so BullMQ can retry (up to configured attempts)
 */
import { prisma } from '@campusforge/db';
import { assertDocumentGenerationPayload } from '../lib/document-job';
import {
  getAIProvider,
  FLASHCARD_SYSTEM_PROMPT,
  buildFlashcardUserPrompt,
  buildFlashcardFromSummaryPrompt,
  parseFlashcardOutput,
} from '@campusforge/ai';
import type { DocumentSummary } from '@campusforge/ai';

export interface FlashcardJobData {
  documentId: string;
  workspaceId: string;
  userId: string;
}

export async function processFlashcardJob(data: FlashcardJobData): Promise<void> {
  assertDocumentGenerationPayload(data);
  const { documentId, workspaceId, userId } = data;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId, lifecycle: 'ACTIVE', processingStatus: 'COMPLETED' },
    select: { parsedText: true, filename: true, summaryJson: true },
  });
  if (!doc) return;

  // 1. Create AIJob record
  const aiJob = await prisma.aIJob.create({
    data: {
      type: 'FLASHCARD',
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

    // 3. Fetch document with parsed text and summary
    if (!doc.parsedText || doc.parsedText.trim().length === 0) {
      throw new Error(
        `Document ${documentId} has no parsed text. Parse must complete before flashcard generation.`,
      );
    }

    // 4. Call AI provider — prefer summary for higher quality, fall back to raw text
    const provider = getAIProvider();

    let userPrompt: string;
    if (doc.summaryJson && typeof doc.summaryJson === 'object') {
      // Use the summary for more focused flashcards
      userPrompt = buildFlashcardFromSummaryPrompt(
        doc.summaryJson as unknown as DocumentSummary,
        doc.filename,
      );
    } else {
      // Fall back to raw document text
      userPrompt = buildFlashcardUserPrompt(doc.parsedText, doc.filename);
    }

    const result = await provider.completeJSON({
      systemPrompt: FLASHCARD_SYSTEM_PROMPT,
      userPrompt,
      parse: parseFlashcardOutput,
      maxTokens: 4096, // Flashcards need more output tokens than summaries
    });

    // 5. Persist results
    const cardsData = JSON.parse(JSON.stringify(result.data.cards));
    const outputData = JSON.parse(JSON.stringify(result.data));

    await prisma.$transaction(async (tx) => {
      // Take a guarded document write lock before publishing a derived result.
      // This serializes with the delete tombstone without changing retention.
      const source = await tx.document.updateMany({
        where: { id: documentId, workspaceId, lifecycle: 'ACTIVE', processingStatus: 'COMPLETED' },
        data: { updatedAt: new Date() },
      });
      if (!source.count) throw new Error('Source document is no longer available');
      // Create the FlashcardSet record
      await tx.flashcardSet.create({
        data: {
          workspaceId,
          title: result.data.title,
          sourceDocumentId: documentId,
          cardsJson: cardsData,
          cardCount: result.data.cards.length,
        },
      });
      // Store output + metadata on the AIJob
      await tx.aIJob.update({
        where: { id: aiJob.id },
        data: {
          status: 'COMPLETED',
          outputJson: outputData,
          tokenUsage: result.meta.totalTokens,
          estimatedCost: result.meta.estimatedCost,
          latencyMs: result.meta.latencyMs,
        },
      });
    });

    console.log(
      `[CampusForge Worker] Flashcards generated for "${doc.filename}" — ` +
        `${result.data.cards.length} cards, ${result.meta.totalTokens} tokens, ${result.meta.latencyMs}ms`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `[CampusForge Worker] Flashcard generation failed for document ${documentId}:`,
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
