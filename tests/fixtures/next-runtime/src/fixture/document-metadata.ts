/** Explicit synthetic DTO metadata; no parsed source or storage internals enter client props. */
export function syntheticDocumentMetadata(processingStatus: string = 'COMPLETED') {
  const eligible = processingStatus === 'COMPLETED';
  const reason = eligible ? null : 'Text extraction must complete before generation.';
  return {
    parseError: processingStatus === 'FAILED' ? 'Synthetic text extraction failed.' : null,
    parseAttempts: processingStatus === 'FAILED' ? 3 : 0,
    parseMaxAttempts: 3,
    parseNextAttemptAt: null,
    parseRetryScheduled: false,
    aiInput: {
      maxInputTokens: 16000,
      estimateMethod: 'utf8-bytes-plus-overhead' as const,
      textBytes: eligible ? 17 : 0,
      summary: { estimatedInputTokens: eligible ? 900 : null, eligible, reason },
      flashcards: { estimatedInputTokens: eligible ? 1200 : null, eligible, reason },
    },
  };
}
