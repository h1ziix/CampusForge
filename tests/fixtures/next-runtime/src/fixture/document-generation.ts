import type { AIJobRow, DocumentSummaryRow } from '@/server/queries/summary';
import type { FlashcardSetDetailRow } from '@/server/queries/flashcard';

/** Synthetic persistence for browser contract checks; never a DB or AI provider. */
const workspaceId = 'r2-generation-workspace';
const userId = 'r2-generation-user';
const timestamp = '2026-10-08T00:00:00.000Z';
type Kind = 'SUMMARY' | 'FLASHCARD';
type Mode = 'complete' | 'pending' | 'failed' | 'uncertain' | 'lost-receipt';
interface SyntheticOperation {
  documentId: string;
  type: Kind;
  idempotencyKey: string;
  job: AIJobRow;
}
interface SyntheticGenerationState {
  mode: Mode;
  operations: Map<string, SyntheticOperation>;
  requests: { documentId: string; type: Kind; idempotencyKey: string }[];
  reads: number;
  lostReceipt: boolean;
  readOutage: boolean;
  summaries: Map<string, DocumentSummaryRow>;
  sets: Map<string, FlashcardSetDetailRow>;
  parseStatuses: Map<string, string>;
}
const fixtureGlobal = globalThis as typeof globalThis & {
  __campusForgeGenerationFixture?: SyntheticGenerationState;
};
export function generationState(): SyntheticGenerationState {
  return (fixtureGlobal.__campusForgeGenerationFixture ??= {
    mode: 'complete',
    operations: new Map(),
    requests: [],
    reads: 0,
    lostReceipt: false,
    readOutage: false,
    summaries: new Map(),
    sets: new Map(),
    parseStatuses: new Map(),
  });
}
export function resetGeneration(mode: Mode = 'complete') {
  fixtureGlobal.__campusForgeGenerationFixture = undefined;
  generationState().mode = mode;
}

export const generationIdentity = { workspaceId, userId };
const source = (id: string) =>
  id === 'botany'
    ? {
        title: 'Photosynthesis',
        fact: 'Chlorophyll absorbs light so plants can produce sugars.',
        term: 'Chlorophyll',
        question: 'What absorbs light during photosynthesis?',
        answer: 'Chlorophyll.',
      }
    : {
        title: 'Orbital motion',
        fact: 'Gravity provides the centripetal force that keeps a satellite in orbit.',
        term: 'Gravity',
        question: 'What force keeps a satellite in orbit?',
        answer: 'Gravity provides the centripetal force.',
      };

export function syntheticDocument(id: string) {
  const oversized = id === 'oversized';
  const processingStatus =
    generationState().parseStatuses.get(id) ??
    (id === 'r3-synthetic-document'
      ? 'PENDING'
      : id === 'parse-pending'
        ? 'PENDING'
        : id === 'parse-failed'
          ? 'FAILED'
          : 'COMPLETED');
  const reason = oversized
    ? 'Document exceeds the configured AI input budget. Shorten the source and upload a separate document; no text is truncated.'
    : processingStatus !== 'COMPLETED'
      ? 'Text extraction must complete before generation.'
      : null;
  return {
    id,
    filename: `${id}-permitted-notes.txt`,
    mimeType: 'text/plain',
    sizeBytes: 256,
    processingStatus,
    hasSummary: generationState().summaries.has(id),
    createdAt: timestamp,
    updatedAt: timestamp,
    parseError: processingStatus === 'FAILED' ? 'Synthetic text extraction failed.' : null,
    parseAttempts: 1,
    parseMaxAttempts: 3,
    parseNextAttemptAt: null,
    parseRetryScheduled: false,
    aiInput: {
      maxInputTokens: 16000,
      estimateMethod: 'utf8-bytes-plus-overhead' as const,
      textBytes: oversized ? 25000 : Buffer.byteLength(source(id).fact, 'utf8'),
      summary: { estimatedInputTokens: oversized ? 26000 : 900, eligible: !reason, reason },
      flashcards: { estimatedInputTokens: oversized ? 27000 : 1200, eligible: !reason, reason },
    },
  };
}

export function completeSyntheticOperation(operation: SyntheticOperation) {
  const state = generationState();
  const content = source(operation.documentId);
  operation.job.status = 'COMPLETED';
  operation.job.errorMessage = null;
  operation.job.finishedAt = timestamp;
  if (operation.type === 'SUMMARY') {
    state.summaries.set(operation.documentId, {
      title: content.title,
      tldr: content.fact,
      sections: [{ heading: 'Source concept', content: content.fact }],
      keyTerms: [content.term],
    });
  } else {
    const id = `saved-${operation.documentId}`;
    state.sets.set(id, {
      id,
      title: `${content.title} practice`,
      cardCount: 1,
      cards: [{ front: content.question, back: content.answer }],
      sourceDocumentId: operation.documentId,
      sourceDocumentFilename: syntheticDocument(operation.documentId).filename,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

export function generationSnapshot(documentId: string, countRead = false) {
  const state = generationState();
  if (countRead) state.reads++;
  const operations = [...state.operations.values()].filter((op) => op.documentId === documentId);
  return {
    document: syntheticDocument(documentId),
    summary: state.summaries.get(documentId) ?? null,
    summaryJob: operations.filter((op) => op.type === 'SUMMARY').at(-1)?.job ?? null,
    flashcardJob: operations.filter((op) => op.type === 'FLASHCARD').at(-1)?.job ?? null,
    flashcardSets: [...state.sets.values()]
      .filter((set) => set.sourceDocumentId === documentId)
      .map(({ cards: _cards, ...set }) => {
        void _cards;
        return set;
      }),
  };
}

export async function syntheticGenerate(type: Kind, form: FormData) {
  const state = generationState();
  const documentId = String(form.get('documentId') ?? '');
  const idempotencyKey = String(form.get('idempotencyKey') ?? '');
  if (!documentId || !/^[A-Za-z0-9._-]{1,128}$/.test(idempotencyKey)) {
    return { success: false as const, error: 'A valid stable idempotency key is required.' };
  }
  state.requests.push({ documentId, type, idempotencyKey });
  const operationKey = `${documentId}:${type}:${idempotencyKey}`;
  let operation = state.operations.get(operationKey);
  if (!operation) {
    operation = {
      documentId,
      type,
      idempotencyKey,
      job: {
        id: `synthetic-op-${state.operations.size + 1}`,
        type,
        status: 'PENDING',
        idempotencyKey,
        attemptCount: 1,
        maxAttempts: 3,
        nextAttemptAt: null,
        finishedAt: null,
        tokenUsage: null,
        estimatedCost: null,
        latencyMs: null,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as AIJobRow,
    };
    state.operations.set(operationKey, operation);
    if (state.mode === 'complete') completeSyntheticOperation(operation);
    if (state.mode === 'failed') {
      operation.job.status = 'FAILED';
      operation.job.errorMessage = 'Synthetic provider output failed validation.';
    }
    if (state.mode === 'uncertain') {
      operation.job.status = 'UNCERTAIN';
      operation.job.errorMessage = 'Synthetic provider receipt was lost after dispatch.';
    }
  }
  if (state.mode === 'lost-receipt' && !state.lostReceipt) {
    state.lostReceipt = true;
    return {
      success: false as const,
      error: 'Could not confirm AI operation. Retry with the same idempotency key.',
    };
  }
  return {
    success: true as const,
    data: { documentId, operationId: operation.job.id, status: operation.job.status },
  };
}

export function seedSavedResults(documentId: string) {
  for (const type of ['SUMMARY', 'FLASHCARD'] as const) {
    const form = new FormData();
    form.set('documentId', documentId);
    form.set('idempotencyKey', `seed-${documentId}-${type}`);
    void syntheticGenerate(type, form);
  }
}
