/**
 * CampusForge Worker — Document parsing job processor.
 *
 * Downloads a document from S3, extracts text based on MIME type,
 * and writes the parsed text back to the Document record.
 *
 * Supported formats:
 * - PDF: uses pdf-parse for text extraction
 * - TXT/Markdown: reads as UTF-8 string
 *
 * Error handling:
 * - Sets processingStatus to FAILED if parsing fails
 * - Re-throws so BullMQ can retry (up to 3 attempts)
 */
import { prisma } from '@campusforge/db';
import { getFromS3 } from '../lib/s3';
import { extractPdfText } from '../lib/pdf';

/**
 * Collect a ReadableStream or AsyncIterable into a single Buffer.
 */
async function streamToBuffer(
  stream: NodeJS.ReadableStream | AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Process a single document: download, parse, update DB.
 */
export async function processDocumentJob(documentId: string): Promise<void> {
  // Mark as PROCESSING
  await prisma.document.update({
    where: { id: documentId },
    data: { processingStatus: 'PROCESSING' },
  });

  try {
    // 1. Fetch document metadata
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { storageKey: true, mimeType: true, filename: true },
    });

    if (!doc) {
      throw new Error(`Document ${documentId} not found in database`);
    }

    // 2. Download file from S3
    const s3Body = await getFromS3(doc.storageKey);
    if (!s3Body) {
      throw new Error(`Empty response from S3 for key: ${doc.storageKey}`);
    }

    const buffer = await streamToBuffer(s3Body as AsyncIterable<Uint8Array>);

    // 3. Extract text based on MIME type
    let parsedText = '';

    if (doc.mimeType === 'application/pdf') {
      parsedText = await extractPdfText(buffer);
    } else if (doc.mimeType === 'text/plain' || doc.mimeType === 'text/markdown') {
      parsedText = buffer.toString('utf-8');
    } else {
      // Unsupported type that somehow passed validation — store empty
      console.warn(`[CampusForge Worker] Unsupported MIME type for parsing: ${doc.mimeType}`);
      parsedText = '';
    }

    // 4. Persist parsed text and mark as COMPLETED
    await prisma.document.update({
      where: { id: documentId },
      data: {
        parsedText,
        processingStatus: 'COMPLETED',
      },
    });

    console.log(
      `[CampusForge Worker] Parsed "${doc.filename}" — ${parsedText.length} chars extracted`,
    );
  } catch (error) {
    console.error(`[CampusForge Worker] Parse error for document ${documentId}:`, error);

    // Mark as FAILED — BullMQ may retry depending on attempt count
    await prisma.document
      .update({
        where: { id: documentId },
        data: { processingStatus: 'FAILED' },
      })
      .catch((updateErr) => {
        console.error('[CampusForge Worker] Failed to update status to FAILED:', updateErr);
      });

    // Re-throw so BullMQ knows the job failed (triggers retry)
    throw error;
  }
}
