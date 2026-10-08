# R3 agreed lifecycle contract

The contract below was fixed before parallel application edits on 2026-10-05.

Each operation receives an immutable UUID. Its S3 key is `documents/{workspaceId}/{id}`; original filename is metadata. A persisted upload intent owns that key before network upload starts. S3 writes have a finite abort deadline shorter than the intent's ten-minute upload lease. Finalization creates ACTIVE/PENDING Document, stable `parse-{id}-v1` task and FINALIZED intent in one short PostgreSQL transaction. There is no S3 or Redis call in that transaction.

Upload intent: UPLOADING → FINALIZED, or UPLOADING → CLEANUP → DONE. Expired UPLOADING is recovered as cleanup. Cleanup is deferred past the upload lease and repeatedly deletes through a quarantine interval so a timed-out transport cannot immediately recreate an untracked object. Receipts are retained; no ledger cascade can erase an outstanding cleanup.

Document: ACTIVE with PENDING → PROCESSING → COMPLETED or FAILED parsing. Parsing has a token, expiry, finite work timeout and conditional completion. Retries/recovery are persisted independently from Redis. A durable PARSE task remains retryable until parsing completion, rather than considering queue delivery proof of completion. Expired claims can be atomically reclaimed by another dispatcher. Completed/failed Redis records can be removed and the stable job identity redelivered; a committed DB result skips repeated parsing.

Deletion: ACTIVE → DELETING with durable DELETE task in one transaction. All ordinary document reads and generation entrances require ACTIVE. Deletion fences parser result publication and cancels its durable task. S3 delete is idempotent; only afterward does a short transaction physically delete the tombstoned Document and finish the cleanup task. A failure preserves the tombstone and retryable task. Existing flashcards, quizzes and AIJob records retain their original SetNull policy; R3 does not introduce artifact erasure.

Crash windows to verify: intent commit before Put; Put success before finalization; ambiguous finalization commit; Document/task commit before enqueue; queue acceptance before delivery-mark; claim loss/restart; parse before/after result commit; delete intent before S3; S3 delete before DB finalization; parse/delete race. PostgreSQL is authoritative for identity, ownership and lifecycle. Redis carries an ID, never permission or authoritative storage metadata.

The storage uniqueness migration fails closed on old duplicate keys. It neither renames nor deletes existing objects. Migration is tested only against a fresh disposable database; an existing target requires a read-only duplicate-key preflight, backup and reviewed recovery plan.
