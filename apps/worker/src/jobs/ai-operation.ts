import {
  prisma,
  createAIOperationLifecycle,
  AI_PROMPT_VERSION,
  type AIOperationParameters,
  type AIJob,
  type Prisma,
  type PrismaClient,
} from '@campusforge/db';
import {
  getAIProvider,
  AIProviderError,
  SUMMARY_SYSTEM_PROMPT,
  FLASHCARD_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  buildFlashcardUserPrompt,
  parseSummaryOutput,
  parseFlashcardOutput,
  type AIProvider,
} from '@campusforge/ai';
import { readAIEnvironmentPolicy } from '@campusforge/shared';

export interface AIOperationProcessorOptions {
  db: PrismaClient;
  provider?: Pick<AIProvider, 'completeJSON'>;
  now?: () => Date;
  leaseMs?: number;
  heartbeatMs?: number;
  random?: () => number;
}

/** Queue payloads contain only the operation identity; input/policy come from PostgreSQL. */
export function createAIOperationProcessor(options: AIOperationProcessorOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? readAIEnvironmentPolicy().leaseMs;
  const heartbeatMs = options.heartbeatMs ?? Math.max(100, Math.floor(leaseMs / 3));
  const random = options.random ?? Math.random;
  const lifecycle = createAIOperationLifecycle(db, { now, leaseMs });
  return async function processAIOperation(operationId: string): Promise<AIJob | null> {
    if (typeof operationId !== 'string' || !operationId || operationId.length > 128)
      throw new Error('INVALID_AI_OPERATION_IDENTITY');
    const existing = await db.aIJob.findUnique({ where: { id: operationId } });
    if (!existing || lifecycle.isTerminal(existing.status)) return existing;
    await lifecycle.recoverOperations();
    const operation = await lifecycle.claimOperation(operationId);
    if (!operation?.leaseToken) return db.aIJob.findUnique({ where: { id: operationId } });
    const token = operation.leaseToken;
    const params = operation.parametersJson as unknown as AIOperationParameters;
    const input = operation.inputJson as {
      text?: string;
      filename?: string;
      promptVersion?: string;
    } | null;
    const abort = new AbortController();
    let heartbeatPending: Promise<void> | null = null;
    let received = false;
    let resultPersistenceStarted = false;
    let attemptId: string | undefined;
    const heartbeat = setInterval(() => {
      if (heartbeatPending || abort.signal.aborted) return;
      heartbeatPending = lifecycle
        .renewLease(operationId, token)
        .then((active) => {
          if (!active) abort.abort(new Error('AI_OPERATION_LEASE_LOST'));
        })
        .catch(() => {
          abort.abort(new Error('AI_LEASE_RENEWAL_FAILED'));
        })
        .finally(() => {
          heartbeatPending = null;
        });
    }, heartbeatMs);
    const deadline = setTimeout(
      () => abort.abort(new Error('AI_OPERATION_DEADLINE')),
      Math.max(1, (operation.deadlineAt?.getTime() ?? now().getTime()) - now().getTime()),
    );
    try {
      if (
        !input?.text ||
        input.promptVersion !== AI_PROMPT_VERSION ||
        !params ||
        !operation.model ||
        !['SUMMARY', 'FLASHCARD'].includes(operation.type)
      ) {
        await lifecycle.failAttempt({
          operationId,
          leaseToken: token,
          errorCode: 'INVALID_TRUSTED_OPERATION',
          retryable: false,
          outcome: 'KNOWN_FAILURE',
        });
        return db.aIJob.findUnique({ where: { id: operationId } });
      }
      const attempt = await lifecycle.beginAttempt(operationId, token);
      if (!attempt) return db.aIJob.findUnique({ where: { id: operationId } });
      attemptId = attempt.id;
      // Persisted STARTED precedes the paid request. No provider call occurs on a replay or lost lease.
      abort.signal.throwIfAborted();
      const provider = options.provider ?? getAIProvider();
      const summary = operation.type === 'SUMMARY';
      const parse = (raw: unknown) =>
        summary ? parseSummaryOutput(raw) : parseFlashcardOutput(raw);
      const result = await provider.completeJSON({
        systemPrompt: summary ? SUMMARY_SYSTEM_PROMPT : FLASHCARD_SYSTEM_PROMPT,
        userPrompt: summary
          ? buildSummaryUserPrompt(input.text, input.filename)
          : buildFlashcardUserPrompt(input.text, input.filename),
        model: operation.model,
        maxTokens: params.maxOutputTokens,
        temperature: params.temperature,
        maxInputTokens: params.maxInputTokens,
        requestTimeoutMs: Math.min(
          params.requestTimeoutMs,
          Math.max(1, operation.deadlineAt!.getTime() - now().getTime()),
        ),
        connectionTimeoutMs: Math.min(
          params.connectionTimeoutMs,
          Math.max(1, operation.deadlineAt!.getTime() - now().getTime()),
        ),
        signal: abort.signal,
        parse,
        onResponse: async (meta) => {
          await lifecycle.recordResponse(attempt.id, meta);
          received = true;
        },
      });
      // Deterministic provider adapters have the same accounting and validation boundary.
      if (!received) {
        await lifecycle.recordResponse(attempt.id, result.meta);
        received = true;
      }
      const validated = parse(result.data);
      resultPersistenceStarted = true;
      await lifecycle.completeOperation({
        operationId,
        attemptId: attempt.id,
        leaseToken: token,
        output: validated as unknown as Prisma.InputJsonValue,
      });
    } catch (error) {
      const known = error instanceof AIProviderError;
      const outcome = known
        ? error.outcome
        : received
          ? 'RECEIVED'
          : attemptId
            ? 'UNKNOWN'
            : 'KNOWN_FAILURE';
      const errorCode = known
        ? error.code
        : resultPersistenceStarted
          ? 'RESULT_PERSISTENCE_FAILED'
          : received
            ? 'OUTPUT_VALIDATION_FAILED'
            : attemptId
              ? 'PROVIDER_OUTCOME_UNKNOWN'
              : 'ATTEMPT_START_FAILED';
      const localBackoffMs = Math.min(
        30_000,
        1000 * 2 ** Math.min(operation.attemptCount, 5) * (0.75 + random() * 0.5),
      );
      // Retry-After is a minimum delay. If it exceeds the operation deadline,
      // failAttempt terminates rather than issuing a premature paid request.
      const remainingMs = Math.max(0, operation.deadlineAt!.getTime() - now().getTime());
      const backoffMs = Math.max(
        localBackoffMs,
        Math.min(known ? (error.retryAfterMs ?? 0) : 0, remainingMs + 1),
      );
      await lifecycle.failAttempt({
        operationId,
        attemptId,
        leaseToken: token,
        errorCode,
        retryable: known && error.retryable,
        outcome,
        backoffMs,
      });
      console.error(
        `[CampusForge Worker] AI operation ${operationId} attempt ${attemptId ?? 'none'}: ${errorCode}`,
      );
    } finally {
      clearTimeout(deadline);
      clearInterval(heartbeat);
      await heartbeatPending;
    }
    // Finalize deadline/lost-lease races without granting another paid call.
    await lifecycle.recoverOperations();
    return db.aIJob.findUnique({ where: { id: operationId } });
  };
}

export const processAIOperation = createAIOperationProcessor({ db: prisma });
