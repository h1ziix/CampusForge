-- Fail closed on legacy duplicate keys; never rename/delete existing objects.
BEGIN;
CREATE TYPE "DocumentLifecycle" AS ENUM ('ACTIVE', 'DELETING');
CREATE TYPE "UploadIntentStatus" AS ENUM ('UPLOADING', 'FINALIZED', 'CLEANUP', 'DONE');
CREATE TYPE "DocumentTaskKind" AS ENUM ('PARSE', 'DELETE');
CREATE TYPE "DocumentTaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'DONE');

ALTER TABLE "Document"
  ADD COLUMN "lifecycle" "DocumentLifecycle" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "parseLeaseToken" TEXT,
  ADD COLUMN "parseLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "parseAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "parseNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "parseError" TEXT;
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX "Document_lifecycle_processingStatus_parseNextAttemptAt_idx"
  ON "Document"("lifecycle", "processingStatus", "parseNextAttemptAt");

CREATE TABLE "DocumentUploadIntent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" "UploadIntentStatus" NOT NULL DEFAULT 'UPLOADING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cleanupUntil" TIMESTAMP(3) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentUploadIntent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentUploadIntent_storageKey_key" ON "DocumentUploadIntent"("storageKey");
CREATE INDEX "DocumentUploadIntent_status_availableAt_idx" ON "DocumentUploadIntent"("status", "availableAt");

CREATE TABLE "DocumentTask" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "kind" "DocumentTaskKind" NOT NULL,
  "status" "DocumentTaskStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentTask_status_availableAt_idx" ON "DocumentTask"("status", "availableAt");
CREATE INDEX "DocumentTask_documentId_kind_idx" ON "DocumentTask"("documentId", "kind");

-- Recover legacy stranded parsing without changing keys or completed documents.
INSERT INTO "DocumentTask" (
  "id", "documentId", "workspaceId", "storageKey", "kind", "updatedAt"
)
SELECT 'parse-' || "id" || '-v1', "id", "workspaceId", "storageKey", 'PARSE', CURRENT_TIMESTAMP
FROM "Document" WHERE "processingStatus" IN ('PENDING', 'PROCESSING', 'FAILED');
COMMIT;
