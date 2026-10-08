import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './client';
import type { AIJob, Prisma, PrismaClient } from '../generated/client';

export const aiTaskId = (id: string): string => `ai-${id}`;
/** Bump when prompts or prompt construction change; old snapshots fail closed. */
export const AI_PROMPT_VERSION = 'campusforge-study-r4-v1';
const terminalStates = ['COMPLETED', 'FAILED', 'UNCERTAIN', 'CANCELLED'] as const;
type TerminalState = (typeof terminalStates)[number];
export interface AIOperationParameters {
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  maxAttempts: number;
  operationTimeoutMs: number;
  requestTimeoutMs: number;
  connectionTimeoutMs: number;
}
export interface AIOperationRequest {
  userId: string;
  workspaceId: string;
  documentId: string;
  type: 'SUMMARY' | 'FLASHCARD';
  idempotencyKey: string;
  model: string;
  parameters: AIOperationParameters;
  reservationMicros: number;
  workspaceBudgetMicros?: number;
  operationBudgetMicros?: number;
  workspaceConcurrency?: number;
  validateSnapshot?: (snapshot: {
    text: string;
    filename: string;
    type: 'SUMMARY' | 'FLASHCARD';
  }) => void;
}
export interface AIReceivedMeta {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  usageStatus: 'RECEIVED' | 'MISSING';
  estimatedCost: number | null;
  pricingVersion: string | null;
  requestId: string | null;
  latencyMs: number;
}
export class AIOperationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AIOperationError';
  }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const isTerminal = (status: string) => terminalStates.includes(status as TerminalState);

/** DB-only lifecycle. Redis delivery and paid calls never run inside transactions. */
export function createAIOperationLifecycle(
  db: PrismaClient,
  options: { now?: () => Date; leaseMs?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? 60_000;
  const owned = (id: string, token: string): Prisma.AIJobWhereInput => ({
    id,
    status: 'PROCESSING',
    leaseToken: token,
    leaseUntil: { gt: now() },
    deadlineAt: { gt: now() },
  });

  async function settleBudget(tx: Prisma.TransactionClient, operation: AIJob, uncertain: boolean) {
    const settled = await tx.aIJob.updateMany({
      where: { id: operation.id, budgetReleased: false },
      data: { budgetReleased: true },
    });
    if (!settled.count || !operation.workspaceId) return;
    const attempts = await tx.aIAttempt.findMany({ where: { operationId: operation.id } });
    const receivedMicros = attempts.reduce(
      (sum, attempt) => sum + (attempt.estimatedMicros ?? 0),
      0,
    );
    const received = attempts.filter((attempt) => attempt.usageStatus !== 'NOT_APPLICABLE');
    await tx.aIJob.update({
      where: { id: operation.id },
      data: {
        tokenUsage:
          received.length && received.every((attempt) => attempt.totalTokens !== null)
            ? received.reduce((sum, attempt) => sum + attempt.totalTokens!, 0)
            : null,
        estimatedCost:
          received.length && received.every((attempt) => attempt.estimatedCost !== null)
            ? received.reduce((sum, attempt) => sum + attempt.estimatedCost!, 0)
            : null,
        latencyMs: attempts.reduce((sum, attempt) => sum + (attempt.latencyMs ?? 0), 0),
      },
    });
    await tx.aIWorkspaceBudget.update({
      where: { workspaceId: operation.workspaceId },
      data: {
        activeOperations: { decrement: 1 },
        reservedMicros: { decrement: uncertain ? 0 : operation.reservedMicros },
        usedMicros: { increment: receivedMicros },
      },
    });
  }

  async function finish(
    tx: Prisma.TransactionClient,
    operation: AIJob,
    status: TerminalState,
    errorCode: string | null,
    uncertain: boolean,
  ) {
    const ledger = await tx.aIAttempt.findMany({ where: { operationId: operation.id } });
    uncertain =
      uncertain ||
      ledger.some(
        (attempt) =>
          ['UNKNOWN', 'MISSING'].includes(attempt.usageStatus) ||
          attempt.status === 'UNCERTAIN' ||
          (attempt.usageStatus === 'RECEIVED' && attempt.estimatedMicros === null),
      );
    await tx.aIJob.update({
      where: { id: operation.id },
      data: {
        status,
        errorMessage: errorCode,
        accountingStatus: uncertain ? 'UNCERTAIN' : 'SETTLED',
        leaseToken: null,
        leaseUntil: null,
        finishedAt: now(),
        // The durable receipt keeps the hash, never the source text after terminal work.
        inputJson: { retained: false },
      },
    });
    await tx.documentTask.updateMany({
      where: { operationId: operation.id, kind: 'AI' },
      data: { status: 'DONE', leaseToken: null, leaseUntil: null },
    });
    await settleBudget(tx, operation, uncertain);
  }

  async function requestAIOperation(input: AIOperationRequest): Promise<AIJob> {
    for (const value of [input.userId, input.workspaceId, input.documentId, input.model])
      if (typeof value !== 'string' || !value.trim() || value.length > 512)
        throw new AIOperationError('INVALID_OPERATION_IDENTITY');
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(input.idempotencyKey))
      throw new AIOperationError('INVALID_IDEMPOTENCY_KEY');
    const params = input.parameters;
    const finitePositive = [
      params.maxInputTokens,
      params.maxOutputTokens,
      params.maxAttempts,
      params.operationTimeoutMs,
      params.requestTimeoutMs,
      params.connectionTimeoutMs,
    ];
    if (
      finitePositive.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      params.maxAttempts > 10 ||
      params.maxInputTokens > 100_000 ||
      params.maxOutputTokens > 4096 ||
      params.operationTimeoutMs > 600_000 ||
      params.requestTimeoutMs > 120_000 ||
      params.connectionTimeoutMs > 60_000 ||
      params.requestTimeoutMs > params.operationTimeoutMs ||
      params.connectionTimeoutMs > params.requestTimeoutMs ||
      !Number.isFinite(params.temperature) ||
      params.temperature < 0 ||
      params.temperature > 2
    )
      throw new AIOperationError('INVALID_OPERATION_POLICY');
    const workspaceLimit = input.workspaceBudgetMicros ?? 1_000_000;
    const operationLimit = input.operationBudgetMicros ?? 100_000;
    const concurrency = input.workspaceConcurrency ?? 2;
    if (
      ![input.reservationMicros, workspaceLimit, operationLimit, concurrency].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 2_000_000_000,
      ) ||
      input.reservationMicros > operationLimit
    )
      throw new AIOperationError('OPERATION_BUDGET_EXCEEDED');

    // PostgreSQL serializes all admission/reservation for one workspace on this
    // row, so a duplicate key cannot reserve a slot or budget twice.
    return db.$transaction(
      async (tx) => {
        const membership = await tx.membership.findUnique({
          where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
          select: { id: true },
        });
        if (!membership) throw new AIOperationError('WORKSPACE_ACCESS_DENIED');
        await tx.aIWorkspaceBudget.upsert({
          where: { workspaceId: input.workspaceId },
          create: { workspaceId: input.workspaceId },
          // Nonempty update uses native ON CONFLICT and takes the existing row
          // lock, including twenty first requests on a never-seen workspace.
          update: { activeOperations: { increment: 0 } },
        });
        // An actual guarded write provides a row lock even when Prisma upsert uses ON CONFLICT.
        await tx.aIWorkspaceBudget.update({
          where: { workspaceId: input.workspaceId },
          data: { activeOperations: { increment: 0 } },
        });
        const doc = await tx.document.findFirst({
          where: {
            id: input.documentId,
            workspaceId: input.workspaceId,
            lifecycle: 'ACTIVE',
            processingStatus: 'COMPLETED',
          },
        });
        if (!doc?.parsedText?.trim()) throw new AIOperationError('DOCUMENT_UNAVAILABLE');
        if (Buffer.byteLength(doc.parsedText, 'utf8') > params.maxInputTokens)
          throw new AIOperationError('INPUT_TOKEN_BUDGET_EXCEEDED');
        input.validateSnapshot?.({
          text: doc.parsedText,
          filename: doc.filename,
          type: input.type,
        });
        const inputVersion = hash(doc.parsedText);
        const canonicalParameters = {
          maxInputTokens: params.maxInputTokens,
          maxOutputTokens: params.maxOutputTokens,
          temperature: params.temperature,
          maxAttempts: params.maxAttempts,
          operationTimeoutMs: params.operationTimeoutMs,
          requestTimeoutMs: params.requestTimeoutMs,
          connectionTimeoutMs: params.connectionTimeoutMs,
        };
        const inputHash = hash(
          JSON.stringify({
            documentId: doc.id,
            workspaceId: input.workspaceId,
            type: input.type,
            model: input.model,
            promptVersion: AI_PROMPT_VERSION,
            parameters: canonicalParameters,
            text: doc.parsedText,
            filename: doc.filename,
          }),
        );
        const existing = await tx.aIJob.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: input.workspaceId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.inputHash !== inputHash)
            throw new AIOperationError('IDEMPOTENCY_KEY_CONFLICT');
          return existing;
        }
        const budget = await tx.aIWorkspaceBudget.findUniqueOrThrow({
          where: { workspaceId: input.workspaceId },
        });
        if (budget.activeOperations >= concurrency)
          throw new AIOperationError('WORKSPACE_CONCURRENCY_EXCEEDED');
        if (budget.usedMicros + budget.reservedMicros + input.reservationMicros > workspaceLimit)
          throw new AIOperationError('WORKSPACE_BUDGET_EXCEEDED');
        // Serialize admission with deletion. A source tombstoned while the budget
        // row was locked cannot acquire a fresh durable generation obligation.
        const source = await tx.document.updateMany({
          where: {
            id: doc.id,
            workspaceId: input.workspaceId,
            lifecycle: 'ACTIVE',
            processingStatus: 'COMPLETED',
            parsedText: doc.parsedText,
            filename: doc.filename,
          },
          data: { updatedAt: now() },
        });
        if (!source.count) throw new AIOperationError('DOCUMENT_UNAVAILABLE');
        const operation = await tx.aIJob.create({
          data: {
            type: input.type,
            documentId: doc.id,
            workspaceId: input.workspaceId,
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
            inputHash,
            inputVersion,
            model: input.model,
            parametersJson: { ...canonicalParameters, promptVersion: AI_PROMPT_VERSION },
            inputJson: {
              text: doc.parsedText,
              filename: doc.filename,
              promptVersion: AI_PROMPT_VERSION,
            },
            maxAttempts: params.maxAttempts,
            reservedMicros: input.reservationMicros,
            deadlineAt: new Date(now().getTime() + params.operationTimeoutMs),
          },
        });
        await tx.aIWorkspaceBudget.update({
          where: { workspaceId: input.workspaceId },
          data: {
            reservedMicros: { increment: input.reservationMicros },
            activeOperations: { increment: 1 },
          },
        });
        await tx.documentTask.create({
          data: {
            id: aiTaskId(operation.id),
            operationId: operation.id,
            documentId: doc.id,
            workspaceId: input.workspaceId,
            storageKey: doc.storageKey,
            kind: 'AI',
          },
        });
        return operation;
      },
      { timeout: 15_000 },
    );
  }

  async function claimOperation(id: string): Promise<AIJob | null> {
    const at = now();
    const token = randomUUID();
    const claim = await db.aIJob.updateMany({
      where: {
        id,
        status: { in: ['PENDING', 'RETRY_WAIT'] },
        nextAttemptAt: { lte: at },
        deadlineAt: { gt: at },
        inputHash: { not: null },
      },
      data: {
        status: 'PROCESSING',
        leaseToken: token,
        leaseUntil: new Date(at.getTime() + leaseMs),
      },
    });
    if (!claim.count) return null;
    return db.aIJob.findFirst({ where: { id, leaseToken: token } });
  }

  async function renewLease(id: string, token: string): Promise<boolean> {
    const renewed = await db.aIJob.updateMany({
      where: owned(id, token),
      data: { leaseUntil: new Date(now().getTime() + leaseMs) },
    });
    return renewed.count === 1;
  }

  async function beginAttempt(id: string, token: string) {
    return db.$transaction(async (tx) => {
      const operation = await tx.aIJob.findFirst({ where: owned(id, token) });
      if (!operation?.model || operation.attemptCount >= operation.maxAttempts) return null;
      // This conditional increment fences stale workers and assigns one attempt number.
      const updated = await tx.aIJob.updateMany({
        where: { ...owned(id, token), attemptCount: operation.attemptCount },
        data: { attemptCount: { increment: 1 } },
      });
      if (!updated.count) return null;
      const doc = await tx.document.findFirst({
        where: {
          id: operation.documentId ?? '',
          workspaceId: operation.workspaceId ?? '',
          lifecycle: 'ACTIVE',
          processingStatus: 'COMPLETED',
        },
        select: { id: true },
      });
      if (!doc) {
        await finish(tx, operation, 'CANCELLED', 'DOCUMENT_UNAVAILABLE', false);
        return null;
      }
      return tx.aIAttempt.create({
        data: {
          operationId: id,
          number: operation.attemptCount + 1,
          leaseToken: token,
          requestedModel: operation.model,
        },
      });
    });
  }

  async function recordResponse(attemptId: string, meta: AIReceivedMeta): Promise<void> {
    // Accounting belongs to the attempt even if its worker lost the operation lease.
    const saved = await db.aIAttempt.updateMany({
      where: { id: attemptId, status: { in: ['STARTED', 'UNCERTAIN'] } },
      data: {
        status: 'RECEIVED',
        actualModel: meta.model,
        promptTokens: meta.promptTokens,
        completionTokens: meta.completionTokens,
        totalTokens: meta.totalTokens,
        estimatedCost: meta.estimatedCost,
        estimatedMicros:
          meta.estimatedCost === null ? null : Math.ceil(meta.estimatedCost * 1_000_000),
        pricingVersion: meta.pricingVersion,
        usageStatus: meta.usageStatus,
        providerRequestId: meta.requestId,
        latencyMs: meta.latencyMs,
      },
    });
    if (saved.count === 1) return;
    const existing = await db.aIAttempt.findUnique({ where: { id: attemptId } });
    if (
      !existing ||
      !['RECEIVED', 'SUCCEEDED', 'FAILED'].includes(existing.status) ||
      existing.actualModel !== meta.model ||
      existing.promptTokens !== meta.promptTokens ||
      existing.completionTokens !== meta.completionTokens ||
      existing.totalTokens !== meta.totalTokens ||
      existing.estimatedCost !== meta.estimatedCost ||
      existing.pricingVersion !== meta.pricingVersion ||
      existing.usageStatus !== meta.usageStatus ||
      existing.providerRequestId !== meta.requestId ||
      existing.latencyMs !== meta.latencyMs
    )
      throw new AIOperationError('ACCOUNTING_NOT_PERSISTED');
  }

  async function failAttempt(input: {
    operationId: string;
    attemptId?: string;
    leaseToken: string;
    errorCode: string;
    retryable: boolean;
    outcome: 'KNOWN_FAILURE' | 'RECEIVED' | 'UNKNOWN';
    backoffMs?: number;
  }) {
    return db.$transaction(async (tx) => {
      // Lock operation before any terminal transition; a stale worker may still
      // retain usage on its own attempt but cannot change the generation result.
      const failureFence = owned(input.operationId, input.leaseToken);
      delete failureFence.deadlineAt;
      const guard = await tx.aIJob.updateMany({ where: failureFence, data: { updatedAt: now() } });
      if (!guard.count) return false;
      const operation = await tx.aIJob.findUniqueOrThrow({ where: { id: input.operationId } });
      if (input.attemptId)
        await tx.aIAttempt.updateMany({
          where: {
            id: input.attemptId,
            operationId: operation.id,
            leaseToken: input.leaseToken,
          },
          data: {
            status: input.outcome === 'UNKNOWN' ? 'UNCERTAIN' : 'FAILED',
            errorCode: input.errorCode,
            finishedAt: now(),
            ...(input.outcome === 'KNOWN_FAILURE'
              ? {
                  usageStatus:
                    input.errorCode === 'PROVIDER_SERVER_ERROR' ? 'UNKNOWN' : 'NOT_APPLICABLE',
                }
              : {}),
          },
        });
      const retryAt = new Date(now().getTime() + (input.backoffMs ?? 1000));
      if (
        input.retryable &&
        input.outcome === 'KNOWN_FAILURE' &&
        operation.attemptCount < operation.maxAttempts &&
        operation.deadlineAt &&
        retryAt < operation.deadlineAt
      ) {
        await tx.aIJob.update({
          where: { id: operation.id },
          data: {
            status: 'RETRY_WAIT',
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: retryAt,
            errorMessage: input.errorCode,
          },
        });
        await tx.documentTask.updateMany({
          where: { operationId: operation.id, kind: 'AI' },
          data: {
            status: 'PENDING',
            availableAt: retryAt,
            leaseToken: null,
            leaseUntil: null,
          },
        });
        return true;
      }
      const attempts = await tx.aIAttempt.findMany({ where: { operationId: operation.id } });
      const uncertain =
        input.outcome === 'UNKNOWN' ||
        attempts.some(
          (attempt) =>
            attempt.usageStatus === 'MISSING' ||
            attempt.status === 'UNCERTAIN' ||
            (attempt.usageStatus === 'RECEIVED' && attempt.estimatedMicros === null),
        );
      await finish(
        tx,
        operation,
        input.outcome === 'UNKNOWN' ? 'UNCERTAIN' : 'FAILED',
        input.errorCode,
        uncertain,
      );
      return true;
    });
  }

  async function completeOperation(input: {
    operationId: string;
    attemptId: string;
    leaseToken: string;
    output: Prisma.InputJsonValue;
  }): Promise<boolean> {
    return db.$transaction(async (tx) => {
      const guard = await tx.aIJob.updateMany({
        where: owned(input.operationId, input.leaseToken),
        data: { updatedAt: now() },
      });
      if (!guard.count) return false;
      const operation = await tx.aIJob.findUniqueOrThrow({ where: { id: input.operationId } });
      const attempt = await tx.aIAttempt.findFirst({
        where: {
          id: input.attemptId,
          operationId: operation.id,
          leaseToken: input.leaseToken,
          status: 'RECEIVED',
        },
      });
      if (!attempt) throw new AIOperationError('ACCOUNTING_NOT_PERSISTED');
      // Match admission's budget-before-document lock order to avoid a cycle
      // with a concurrent source admission while publishing this operation.
      await tx.aIWorkspaceBudget.update({
        where: { workspaceId: operation.workspaceId! },
        data: { activeOperations: { increment: 0 } },
      });
      const source = await tx.document.updateMany({
        where: {
          id: operation.documentId ?? '',
          workspaceId: operation.workspaceId ?? '',
          lifecycle: 'ACTIVE',
          processingStatus: 'COMPLETED',
        },
        data: operation.type === 'SUMMARY' ? { summaryJson: input.output } : { updatedAt: now() },
      });
      if (!source.count) {
        await finish(
          tx,
          operation,
          'CANCELLED',
          'DOCUMENT_UNAVAILABLE',
          attempt.usageStatus !== 'RECEIVED' || attempt.estimatedMicros === null,
        );
        return false;
      }
      if (operation.type === 'FLASHCARD') {
        const output = input.output as { title: string; cards: Prisma.InputJsonValue[] };
        await tx.flashcardSet.create({
          data: {
            operationId: operation.id,
            workspaceId: operation.workspaceId!,
            sourceDocumentId: operation.documentId,
            title: output.title,
            cardsJson: output.cards,
            cardCount: output.cards.length,
          },
        });
      }
      await tx.aIAttempt.update({
        where: { id: attempt.id },
        data: { status: 'SUCCEEDED', finishedAt: now() },
      });
      await tx.aIJob.update({
        where: { id: operation.id },
        data: {
          outputJson: input.output,
          tokenUsage: attempt.totalTokens,
          estimatedCost: attempt.estimatedCost,
          latencyMs: attempt.latencyMs,
        },
      });
      await finish(
        tx,
        operation,
        'COMPLETED',
        null,
        attempt.usageStatus !== 'RECEIVED' || attempt.estimatedMicros === null,
      );
      return true;
    });
  }

  async function recoverOperations(batchSize = 20): Promise<void> {
    const at = now();
    const candidates = await db.aIJob.findMany({
      where: {
        inputHash: { not: null },
        OR: [
          {
            status: 'PROCESSING',
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }, { deadlineAt: { lte: at } }],
          },
          { status: { in: ['PENDING', 'RETRY_WAIT'] }, deadlineAt: { lte: at } },
        ],
      },
      take: Math.min(100, Math.max(1, batchSize)),
      orderBy: { updatedAt: 'asc' },
    });
    for (const candidate of candidates)
      await db.$transaction(async (tx) => {
        const claimed = await tx.aIJob.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            leaseToken: candidate.leaseToken,
            leaseUntil: candidate.leaseUntil,
          },
          data: { updatedAt: at },
        });
        if (!claimed.count) return;
        const attempts = await tx.aIAttempt.findMany({ where: { operationId: candidate.id } });
        const interrupted = attempts.some(
          (attempt) => attempt.status === 'STARTED' || attempt.status === 'UNCERTAIN',
        );
        if (interrupted) {
          await tx.aIAttempt.updateMany({
            where: { operationId: candidate.id, status: 'STARTED' },
            data: {
              status: 'UNCERTAIN',
              errorCode: 'WORKER_LOST_AFTER_ATTEMPT_START',
              finishedAt: at,
            },
          });
          await finish(tx, candidate, 'UNCERTAIN', 'WORKER_LOST_AFTER_ATTEMPT_START', true);
        } else if (attempts.some((attempt) => ['RECEIVED', 'SUCCEEDED'].includes(attempt.status))) {
          await finish(
            tx,
            candidate,
            'FAILED',
            'OUTPUT_LOST_AFTER_RESPONSE',
            attempts.some(
              (attempt) =>
                attempt.usageStatus === 'MISSING' ||
                (attempt.usageStatus === 'RECEIVED' && attempt.estimatedMicros === null),
            ),
          );
        } else if (
          !candidate.deadlineAt ||
          candidate.deadlineAt <= at ||
          candidate.attemptCount >= candidate.maxAttempts
        ) {
          await finish(tx, candidate, 'FAILED', 'OPERATION_DEADLINE_OR_ATTEMPTS_EXHAUSTED', false);
        } else {
          await tx.aIJob.update({
            where: { id: candidate.id },
            data: { status: 'RETRY_WAIT', leaseToken: null, leaseUntil: null, nextAttemptAt: at },
          });
          await tx.documentTask.updateMany({
            where: { operationId: candidate.id, kind: 'AI' },
            data: {
              status: 'PENDING',
              availableAt: at,
              leaseToken: null,
              leaseUntil: null,
            },
          });
        }
      });
  }

  async function cleanupAttemptMetadata(input: {
    before: Date;
    batchSize: number;
    workspaceId?: string;
  }) {
    // Identity, numeric ledger and user artifacts are retained. Only request
    // correlation/error detail on old settled terminal attempts is compacted.
    const attempts = await db.aIAttempt.findMany({
      where: {
        finishedAt: { lt: input.before },
        operation: {
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
          accountingStatus: 'SETTLED',
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        OR: [{ providerRequestId: { not: null } }, { errorCode: { not: null } }],
      },
      take: Math.min(100, Math.max(1, input.batchSize)),
      select: { id: true },
    });
    if (!attempts.length) return 0;
    const result = await db.aIAttempt.updateMany({
      where: {
        id: { in: attempts.map((attempt) => attempt.id) },
        operation: {
          accountingStatus: 'SETTLED',
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
        },
      },
      data: { providerRequestId: null, errorCode: null },
    });
    return result.count;
  }

  return {
    requestAIOperation,
    claimOperation,
    renewLease,
    beginAttempt,
    recordResponse,
    failAttempt,
    completeOperation,
    recoverOperations,
    cleanupAttemptMetadata,
    isTerminal,
  };
}

export const { requestAIOperation } = createAIOperationLifecycle(prisma);
