import {
  estimateInputTokenUpperBound,
  estimateReservationMicros,
  SUMMARY_SYSTEM_PROMPT,
  FLASHCARD_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  buildFlashcardUserPrompt,
} from '@campusforge/ai';
import { readAIEnvironmentPolicy } from '@campusforge/shared';

export interface GenerationEligibility {
  estimatedInputTokens: number | null;
  eligible: boolean;
  reason: string | null;
}

export interface DocumentAIInput {
  maxInputTokens: number;
  estimateMethod: 'utf8-bytes-plus-overhead';
  textBytes: number;
  summary: GenerationEligibility;
  flashcards: GenerationEligibility;
}

/** Shared with admission: complete prompts, filename and chat margin, never truncated text. */
export function estimateDocumentInput(
  type: 'SUMMARY' | 'FLASHCARD',
  text: string,
  filename: string,
) {
  return estimateInputTokenUpperBound(
    type === 'SUMMARY' ? SUMMARY_SYSTEM_PROMPT : FLASHCARD_SYSTEM_PROMPT,
    type === 'SUMMARY'
      ? buildSummaryUserPrompt(text, filename)
      : buildFlashcardUserPrompt(text, filename),
  );
}

export function getDocumentAIInput(document: {
  parsedText: string | null;
  filename: string;
  processingStatus: string;
}): DocumentAIInput {
  const policy = readAIEnvironmentPolicy();
  const text = document.parsedText;
  const reservation = estimateReservationMicros(
    policy.model,
    policy.parameters.maxInputTokens,
    policy.parameters.maxOutputTokens,
    policy.parameters.maxAttempts,
  );
  const eligibility = (type: 'SUMMARY' | 'FLASHCARD'): GenerationEligibility => {
    const estimatedInputTokens =
      text === null ? null : estimateDocumentInput(type, text, document.filename);
    let reason: string | null = null;
    if (document.processingStatus !== 'COMPLETED')
      reason = 'Text extraction must complete before generation.';
    else if (!text?.trim())
      reason = 'No readable text was extracted. Scanned PDFs require OCR, which is not supported.';
    else if (estimatedInputTokens! > policy.parameters.maxInputTokens)
      reason =
        'The complete document exceeds the configured AI input budget. Upload a shorter source; no text is silently removed.';
    else if (reservation === null)
      reason = 'The configured AI model has no approved pricing policy.';
    else if (reservation > policy.operationBudgetMicros)
      reason = 'Generation exceeds the configured AI operation budget.';
    return { estimatedInputTokens, eligible: reason === null, reason };
  };
  return {
    maxInputTokens: policy.parameters.maxInputTokens,
    estimateMethod: 'utf8-bytes-plus-overhead',
    textBytes: text === null ? 0 : Buffer.byteLength(text, 'utf8'),
    summary: eligibility('SUMMARY'),
    flashcards: eligibility('FLASHCARD'),
  };
}
