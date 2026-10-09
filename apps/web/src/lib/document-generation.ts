export type GenerationType = 'SUMMARY' | 'FLASHCARD';

export const STATUS_REFRESH_DELAYS = [2_000, 4_000, 8_000, 16_000, 30_000, 30_000] as const;
export const STATUS_READ_DEADLINE_MS = 15_000;
export const ADMISSION_DEADLINE_MS = 30_000;
const activeStates = new Set(['PENDING', 'PROCESSING', 'RETRY_WAIT']);

/** Bound client waiting, not server execution. Late replies cannot replace newer state.
 * An admission timeout is ambiguous, so a retry must retain its logical key.
 */
export function withRequestDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  {
    schedule = (run, delay) => Number(setTimeout(run, delay)),
    cancel = (timer) => clearTimeout(timer),
  }: {
    schedule?: (run: () => void, delay: number) => number;
    cancel?: (timer: number) => void;
  } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = schedule(() => {
      settled = true;
      reject(new Error('Server request deadline exceeded'));
    }, timeoutMs);
    task.then(
      (value) => {
        if (settled) return;
        settled = true;
        cancel(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cancel(timer);
        reject(error);
      },
    );
  });
}

/** An uploaded source is immutable. One document/type is one logical operation,
 * even across tabs, members, a lost response, unavailable storage or a reopen.
 * No document text, result or storage internals are persisted in the browser.
 */
export async function documentOperationKey(
  workspaceId: string,
  documentId: string,
  type: GenerationType,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([workspaceId, documentId, type]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `doc-v1.${type.toLowerCase()}.${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function canRequestGeneration(
  eligible: boolean,
  job: { status: string } | null,
  submitting: boolean,
): boolean {
  return eligible && !job && !submitting;
}

export function hasActiveDocumentWork(state: {
  document: { processingStatus: string; parseRetryScheduled: boolean };
  summaryJob: { status: string } | null;
  flashcardJob: { status: string } | null;
}): boolean {
  return (
    ['PENDING', 'PROCESSING'].includes(state.document.processingStatus) ||
    state.document.parseRetryScheduled ||
    [state.summaryJob, state.flashcardJob].some((job) => job && activeStates.has(job.status))
  );
}

/** Sequential read-only checks. A failure pauses checks; manual reads never restart the budget. */
export function createBoundedStatusRefresh<T>({
  read,
  shouldContinue,
  onResult,
  onError,
  onStop,
  schedule = (run, delay) => window.setTimeout(run, delay),
  cancel = (timer) => window.clearTimeout(timer),
}: {
  read: () => Promise<T>;
  shouldContinue: (result: T) => boolean;
  onResult: (result: T) => void;
  onError: (error: unknown) => void;
  onStop: (reason: 'limit' | 'error' | 'settled') => void;
  schedule?: (run: () => Promise<void>, delay: number) => number;
  cancel?: (timer: number) => void;
}): () => void {
  let stopped = false;
  let attempt = 0;
  let timer: number;
  const run = async () => {
    if (stopped) return;
    attempt += 1;
    try {
      const result = await read();
      if (stopped) return;
      onResult(result);
      if (!shouldContinue(result)) {
        stopped = true;
        onStop('settled');
      } else if (attempt >= STATUS_REFRESH_DELAYS.length) {
        stopped = true;
        onStop('limit');
      } else {
        timer = schedule(run, STATUS_REFRESH_DELAYS[attempt]);
      }
    } catch (error) {
      if (stopped) return;
      stopped = true;
      onError(error);
      onStop('error');
    }
  };
  timer = schedule(run, STATUS_REFRESH_DELAYS[0]);
  return () => {
    stopped = true;
    cancel(timer);
  };
}
