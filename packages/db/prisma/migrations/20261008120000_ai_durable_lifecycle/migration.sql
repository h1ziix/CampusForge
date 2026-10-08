-- Additive R4 migration. Apply only through an explicit administrative rollout.
ALTER TYPE "DocumentTaskKind" ADD VALUE 'AI';
ALTER TYPE "JobStatus" ADD VALUE 'RETRY_WAIT';
ALTER TYPE "JobStatus" ADD VALUE 'UNCERTAIN';
ALTER TYPE "JobStatus" ADD VALUE 'CANCELLED';

BEGIN;
ALTER TABLE "DocumentTask" ADD COLUMN "operationId" TEXT;
CREATE UNIQUE INDEX "DocumentTask_operationId_key" ON "DocumentTask"("operationId");
ALTER TABLE "FlashcardSet" ADD COLUMN "operationId" TEXT;
CREATE UNIQUE INDEX "FlashcardSet_operationId_key" ON "FlashcardSet"("operationId");
ALTER TABLE "AIJob"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "inputHash" TEXT,
  ADD COLUMN "inputVersion" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "parametersJson" JSONB,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "deadlineAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reservedMicros" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "accountingStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "budgetReleased" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "AIJob_workspaceId_idempotencyKey_key" ON "AIJob"("workspaceId", "idempotencyKey");
CREATE INDEX "AIJob_status_nextAttemptAt_idx" ON "AIJob"("status", "nextAttemptAt");
CREATE INDEX "AIJob_status_leaseUntil_idx" ON "AIJob"("status", "leaseUntil");
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_r4_limits_check"
  CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "reservedMicros" >= 0);

CREATE TABLE "AIAttempt" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "leaseToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "requestedModel" TEXT NOT NULL,
  "actualModel" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "estimatedCost" DOUBLE PRECISION,
  "estimatedMicros" INTEGER,
  "pricingVersion" TEXT,
  "usageStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "errorCode" TEXT,
  "providerRequestId" TEXT,
  "latencyMs" INTEGER,
  CONSTRAINT "AIAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AIAttempt_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AIJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AIAttempt_counters_check" CHECK (
    "number" > 0 AND ("promptTokens" IS NULL OR "promptTokens" >= 0)
    AND ("completionTokens" IS NULL OR "completionTokens" >= 0)
    AND ("totalTokens" IS NULL OR "totalTokens" >= 0)
    AND ("estimatedMicros" IS NULL OR "estimatedMicros" >= 0)
  )
);
CREATE UNIQUE INDEX "AIAttempt_operationId_number_key" ON "AIAttempt"("operationId", "number");
CREATE INDEX "AIAttempt_status_startedAt_idx" ON "AIAttempt"("status", "startedAt");

CREATE TABLE "AIWorkspaceBudget" (
  "workspaceId" TEXT NOT NULL,
  "reservedMicros" INTEGER NOT NULL DEFAULT 0,
  "usedMicros" INTEGER NOT NULL DEFAULT 0,
  "activeOperations" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIWorkspaceBudget_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "AIWorkspaceBudget_counters_check" CHECK (
    "reservedMicros" >= 0 AND "usedMicros" >= 0 AND "activeOperations" >= 0
  )
);

-- Historical requests have no trustworthy provider identity or immutable input.
-- Never automatically call the provider to recover these ambiguous executions.
UPDATE "AIJob" SET "status" = 'FAILED', "accountingStatus" = 'LEGACY_UNKNOWN',
  "errorMessage" = 'LEGACY_AI_OUTCOME_UNKNOWN', "finishedAt" = CURRENT_TIMESTAMP,
  "budgetReleased" = true
WHERE "type" IN ('SUMMARY', 'FLASHCARD') AND "status" IN ('PENDING', 'PROCESSING');
COMMIT;
