'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { generateSummaryAction } from '@/server/actions/summary';
import { generateFlashcardsAction } from '@/server/actions/flashcard';
import { getDocumentGenerationStateAction } from '@/server/actions/document';
import type { DocumentGenerationState } from '@/server/queries/document';
import type { GenerationReceipt } from '@/server/services/ai-generation';
import type { SensitiveLease } from '@/lib/privacy';
import {
  canRequestGeneration,
  createBoundedStatusRefresh,
  documentOperationKey,
  hasActiveDocumentWork,
  withRequestDeadline,
  STATUS_READ_DEADLINE_MS,
  ADMISSION_DEADLINE_MS,
  type GenerationType,
} from '@/lib/document-generation';

function invokeServerAction<T>(action: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await action());
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function useDocumentGeneration(
  initial: DocumentGenerationState,
  workspaceId: string,
  lease: SensitiveLease,
) {
  const [source, setSource] = useState(initial.document);
  const [state, setState] = useState(initial);
  // Server navigation/refresh can deliver fresh props without remounting this document.
  if (source !== initial.document) {
    setSource(initial.document);
    setState(initial);
  }
  const [submitting, setSubmitting] = useState<GenerationType | null>(null);
  const [requestErrors, setRequestErrors] = useState<Partial<Record<GenerationType, string>>>({});
  const [receipts, setReceipts] = useState<Partial<Record<GenerationType, GenerationReceipt>>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [refreshStopped, setRefreshStopped] = useState<'limit' | 'error' | 'settled' | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const requestLock = useRef(false);
  const readInFlight = useRef<Promise<DocumentGenerationState> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = useCallback(() => mounted.current && lease.isValid(), [lease]);
  const documentId = state.document.id;

  const read = useCallback(() => {
    if (readInFlight.current) return readInFlight.current;
    const form = new FormData();
    form.set('workspaceId', workspaceId);
    form.set('documentId', documentId);
    const pending = withRequestDeadline(
      invokeServerAction(() => getDocumentGenerationStateAction(form)),
      STATUS_READ_DEADLINE_MS,
    )
      .then((result) => {
        if (!result.success)
          throw new Error('Status could not be checked. Try again when connected.');
        return result.data;
      })
      .finally(() => {
        readInFlight.current = null;
      });
    readInFlight.current = pending;
    return pending;
  }, [workspaceId, documentId]);

  const apply = useCallback(
    (next: DocumentGenerationState) => {
      if (!isCurrent()) return;
      setState(next);
      setRequestErrors((previous) => ({
        ...previous,
        SUMMARY: next.summaryJob || next.summary ? undefined : previous.SUMMARY,
        FLASHCARD: next.flashcardJob || next.flashcardSets.length ? undefined : previous.FLASHCARD,
      }));
      setCheckError(null);
      setCheckedAt(new Date().toLocaleTimeString());
    },
    [isCurrent],
  );

  const active =
    hasActiveDocumentWork(state) ||
    (receipts.SUMMARY && !state.summaryJob) ||
    (receipts.FLASHCARD && !state.flashcardJob);
  useEffect(() => {
    if (!active || !isCurrent()) return;
    return createBoundedStatusRefresh({
      read,
      shouldContinue: hasActiveDocumentWork,
      onResult: apply,
      onError: () => {
        if (isCurrent())
          setCheckError('Status could not be checked. Use Check status to try again.');
      },
      onStop: (reason) => {
        if (isCurrent()) setRefreshStopped(reason);
      },
    });
  }, [active, state.summaryJob?.id, state.flashcardJob?.id, read, apply, isCurrent]);

  async function checkStatus() {
    if (checking || !isCurrent()) return;
    setChecking(true);
    try {
      apply(await read());
    } catch {
      if (isCurrent()) setCheckError('Status could not be checked. Use Check status to try again.');
    } finally {
      if (isCurrent()) setChecking(false);
    }
  }

  async function generate(type: GenerationType) {
    const job = type === 'SUMMARY' ? state.summaryJob : state.flashcardJob;
    const input =
      type === 'SUMMARY' ? state.document.aiInput.summary : state.document.aiInput.flashcards;
    const saved = type === 'SUMMARY' ? Boolean(state.summary) : state.flashcardSets.length > 0;
    if (
      requestLock.current ||
      receipts[type] ||
      saved ||
      !isCurrent() ||
      !canRequestGeneration(input.eligible, job, submitting !== null)
    )
      return;
    requestLock.current = true;
    setSubmitting(type);
    setRequestErrors((previous) => ({ ...previous, [type]: undefined }));
    try {
      const key = await documentOperationKey(workspaceId, documentId, type);
      if (!isCurrent()) return;
      const form = new FormData();
      form.set('workspaceId', workspaceId);
      form.set('documentId', documentId);
      form.set('idempotencyKey', key);
      const result = await withRequestDeadline(
        invokeServerAction(() =>
          (type === 'SUMMARY' ? generateSummaryAction : generateFlashcardsAction)(form),
        ),
        ADMISSION_DEADLINE_MS,
      );
      if (!isCurrent()) return;
      if (!result.success) {
        setRequestErrors((previous) => ({ ...previous, [type]: result.error }));
        return;
      }
      setReceipts((previous) => ({ ...previous, [type]: result.data }));
      setRefreshStopped(null);
      // The receipt confirms admission, not a successful generation.
      try {
        apply(await read());
      } catch {
        if (isCurrent()) setCheckError('Request accepted. Check status to load its saved state.');
      }
    } catch {
      if (isCurrent())
        setRequestErrors((previous) => ({
          ...previous,
          [type]:
            'Request could not be confirmed. Retry request reuses the same key and cannot create another operation.',
        }));
    } finally {
      requestLock.current = false;
      if (isCurrent()) setSubmitting(null);
    }
  }

  return {
    state,
    submitting,
    requestErrors,
    receipts,
    checking,
    checkError,
    refreshStopped,
    checkedAt,
    active: Boolean(active),
    checkStatus,
    generate,
  };
}
