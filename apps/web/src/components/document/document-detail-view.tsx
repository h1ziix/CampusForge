'use client';

import {
  ArrowLeft,
  FileText,
  Sparkles,
  Loader2,
  RefreshCw,
  Layers,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentStatusBadge } from '@/components/document/document-status-badge';
import { DOCUMENT_TYPE_LABELS } from '@campusforge/shared';
import { identityNamespace, type LocalIdentity, type SensitiveLease } from '@/lib/privacy';
import { SessionEnded, usePrivacyLease } from '@/lib/use-privacy-lease';
import { useDocumentGeneration } from '@/lib/use-document-generation';
import type { DocumentGenerationState } from '@/server/queries/document';
import type { AIJobRow } from '@/server/queries/summary';
import type { GenerationReceipt } from '@/server/services/ai-generation';

interface DocumentDetailViewProps extends DocumentGenerationState {
  workspaceId: string;
  identity: LocalIdentity;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function DocumentDetailView(props: DocumentDetailViewProps) {
  return (
    <DocumentPrivacySession
      key={`${identityNamespace(props.identity)}:${props.document.id}`}
      {...props}
    />
  );
}

function DocumentPrivacySession(props: DocumentDetailViewProps) {
  const { lease, revoked } = usePrivacyLease();
  if (revoked) return <SessionEnded />;
  if (!lease)
    return (
      <div className="min-h-[50vh]" role="status" aria-label="Loading document" aria-busy="true">
        <span className="sr-only">Loading document...</span>
      </div>
    );
  return <DocumentSession {...props} lease={lease} />;
}

function DocumentSession(props: DocumentDetailViewProps & { lease: SensitiveLease }) {
  const { workspaceId, lease } = props;
  const flow = useDocumentGeneration(props, workspaceId, lease);
  const { document: doc, summary, summaryJob, flashcardSets, flashcardJob } = flow.state;
  const input = doc.aiInput;
  const summaryDisabled =
    !input.summary.eligible ||
    Boolean(summaryJob || summary || flow.receipts.SUMMARY) ||
    flow.submitting !== null;
  const cardsDisabled =
    !input.flashcards.eligible ||
    Boolean(flashcardJob || flashcardSets.length || flow.receipts.FLASHCARD) ||
    flow.submitting !== null;

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <Link
        href={`/w/${workspaceId}/documents`}
        className="mb-5 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to Documents
      </Link>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div className="flex w-full min-w-0 flex-1 items-start gap-3.5">
          <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">
              {doc.filename}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[doc.mimeType] ?? doc.mimeType} · {formatBytes(doc.sizeBytes)} ·
              Uploaded {new Date(doc.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <DocumentStatusBadge status={doc.processingStatus} />
      </div>

      <div className="mt-5 flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs leading-5 text-muted-foreground" role="status" aria-live="polite">
          <p className="font-medium text-foreground">
            {flow.active ? 'Waiting for server processing' : 'Saved server state'}
          </p>
          <p>
            {flow.active && flow.refreshStopped === 'limit'
              ? 'Automatic checks paused after 6 attempts. Check status manually or return later.'
              : flow.active && flow.refreshStopped === 'error'
                ? 'Automatic checks paused. Check status when connected.'
                : flow.active
                  ? 'Up to 6 automatic checks, with increasing intervals. You can leave and return.'
                  : 'Results are loaded from your workspace and remain available after reopening.'}
          </p>
          {flow.checkedAt && <p>Last checked {flow.checkedAt}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-fit shrink-0 gap-2"
          onClick={flow.checkStatus}
          disabled={flow.checking}
        >
          <RefreshCw
            data-icon="inline-start"
            className={flow.checking ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
            aria-hidden="true"
          />
          {flow.checking ? 'Checking...' : 'Check status'}
        </Button>
      </div>
      {flow.checkError && (
        <p role="alert" className="mt-3 text-sm text-error-foreground">
          {flow.checkError}
        </p>
      )}

      {doc.processingStatus !== 'COMPLETED' && (
        <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-sm leading-6" role="status">
          <p className="font-medium">
            {doc.processingStatus === 'FAILED'
              ? 'Text extraction failed'
              : 'Your file is saved for text extraction'}
          </p>
          <p className="text-muted-foreground">
            {doc.processingStatus === 'FAILED'
              ? doc.parseError || 'The file could not be processed.'
              : 'Generation becomes available after the worker extracts text. No generated result is ready yet.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Attempts: {doc.parseAttempts}/{doc.parseMaxAttempts}.{' '}
            {doc.parseRetryScheduled
              ? `A server retry is scheduled${doc.parseNextAttemptAt ? ` for ${new Date(doc.parseNextAttemptAt).toLocaleString()}` : ''}.`
              : doc.processingStatus === 'FAILED'
                ? 'No automatic extraction retry is scheduled. Try a supported UTF-8 text file.'
                : 'Check status to read the latest server state.'}
          </p>
        </div>
      )}

      <aside
        aria-label="AI input limits"
        className="mt-5 rounded-lg bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground"
      >
        <p className="font-semibold text-foreground">
          AI input budget · {input.maxInputTokens?.toLocaleString() ?? 'Unavailable'}
        </p>
        <p>
          The server uses a conservative estimate: UTF-8 bytes of both prompts + 128, rather than an
          exact tokenizer. Upload size is a separate limit. Full text is sent; oversized material is
          rejected without truncation.
        </p>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-1.5">
            <dt>Summary estimate:</dt>
            <dd className="font-medium text-foreground">
              {input.summary.estimatedInputTokens?.toLocaleString() ?? 'Unavailable'}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Cards estimate:</dt>
            <dd className="font-medium text-foreground">
              {input.flashcards.estimatedInputTokens?.toLocaleString() ?? 'Unavailable'}
            </dd>
          </div>
        </dl>
        <p className="mt-2">
          Generation sends extracted text to the configured AI provider. Use material you are
          allowed to process, and verify answers against your source.
        </p>
      </aside>

      <section aria-labelledby="document-summary-heading" className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="document-summary-heading"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Sparkles className="size-[18px] text-primary" aria-hidden="true" />
            Summary
          </h2>
          {summary ? (
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Saved
            </Badge>
          ) : (
            <Button
              size="sm"
              variant={summaryJob || flow.receipts.SUMMARY ? 'outline' : 'default'}
              className="gap-2"
              disabled={summaryDisabled}
              onClick={() => flow.generate('SUMMARY')}
            >
              {flow.submitting === 'SUMMARY' && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {flow.submitting === 'SUMMARY'
                ? 'Submitting...'
                : flow.requestErrors.SUMMARY
                  ? 'Retry request'
                  : summary
                    ? 'Summary saved'
                    : flow.receipts.SUMMARY || summaryJob
                      ? 'Summary requested'
                      : 'Generate summary'}
            </Button>
          )}
        </div>
        {!input.summary.eligible && !summary && (
          <p className="text-sm text-muted-foreground">{input.summary.reason}</p>
        )}
        <JobState
          job={summaryJob}
          receipt={flow.receipts.SUMMARY}
          requestError={flow.requestErrors.SUMMARY}
        />
        {summary ? (
          <Card className="overflow-hidden shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-5 py-3">
              <p className="text-xs font-medium text-muted-foreground">Saved to your workspace</p>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Server result
              </Badge>
            </div>
            <CardContent className="flex flex-col gap-6 p-5 sm:p-6">
              <div>
                <h3 className="break-words text-xl font-semibold [overflow-wrap:anywhere]">
                  {summary.title}
                </h3>
                <p className="mt-3 whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere]">
                  {summary.tldr}
                </p>
              </div>
              {summary.sections.map((section, index) => (
                <div key={index}>
                  <h4 className="font-semibold">{section.heading}</h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                    {section.content}
                  </p>
                </div>
              ))}
              {summary.keyTerms.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Key terms
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {summary.keyTerms.map((term, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                      >
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          !summaryJob &&
          !flow.receipts.SUMMARY && (
            <EmptyState
              title="A summary from your notes"
              description="Generate a concise overview and key terms from the extracted text. The result will be saved here."
            />
          )
        )}
      </section>

      <section aria-labelledby="document-cards-heading" className="mt-9 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="document-cards-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="size-[18px] text-primary" aria-hidden="true" />
            Flashcards
          </h2>
          {flashcardSets.length > 0 ? (
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Saved
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={cardsDisabled}
              onClick={() => flow.generate('FLASHCARD')}
            >
              {flow.submitting === 'FLASHCARD' && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {flow.submitting === 'FLASHCARD'
                ? 'Submitting...'
                : flow.requestErrors.FLASHCARD
                  ? 'Retry request'
                  : flashcardSets.length
                    ? 'Flashcards saved'
                    : flow.receipts.FLASHCARD || flashcardJob
                      ? 'Flashcards requested'
                      : 'Generate flashcards'}
            </Button>
          )}
        </div>
        {!input.flashcards.eligible && !flashcardSets.length && (
          <p className="text-sm text-muted-foreground">{input.flashcards.reason}</p>
        )}
        <JobState
          job={flashcardJob}
          receipt={flow.receipts.FLASHCARD}
          requestError={flow.requestErrors.FLASHCARD}
        />
        {flashcardSets.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {flashcardSets.map((set) => (
              <li
                key={set.id}
                className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="break-words font-semibold [overflow-wrap:anywhere]">
                    {set.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'} · Saved{' '}
                    {new Date(set.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button asChild size="sm" className="w-fit shrink-0 gap-2">
                  <Link href={`/w/${workspaceId}/flashcards/${set.id}`}>
                    <GraduationCap className="size-4" aria-hidden="true" />
                    Study
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !flashcardJob &&
          !flow.receipts.FLASHCARD && (
            <EmptyState
              title="Turn your material into practice"
              description="Generate a saved flashcard set from the extracted text, then open it in Study to reveal and review answers."
            />
          )
        )}
      </section>
    </div>
  );
}

function JobState({
  job,
  receipt,
  requestError,
}: {
  job: AIJobRow | null;
  receipt?: GenerationReceipt;
  requestError?: string;
}) {
  const status = job?.status ?? receipt?.status;
  const descriptions: Record<string, string> = {
    PENDING: 'Queued on the server. Waiting for a worker.',
    PROCESSING: 'The worker is processing this request. Check status for its latest saved result.',
    RETRY_WAIT: 'The server scheduled a bounded retry of this same operation.',
    COMPLETED: 'The server completed this operation. Saved results appear below.',
    FAILED: 'Generation failed. This operation has stopped and has no successful new result.',
    CANCELLED: 'This operation was cancelled. No successful new result was created.',
    UNCERTAIN:
      'The provider outcome is unknown. A charge may have occurred. No new paid generation will start automatically. Check status or ask the workspace owner to reconcile the operation.',
  };
  const failed = ['FAILED', 'CANCELLED', 'UNCERTAIN'].includes(status ?? '');
  if (status === 'COMPLETED' && !requestError)
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          COMPLETED
        </span>
        {job && (
          <span className="break-all">
            Operation {job.id} · Attempts {job.attemptCount}/{job.maxAttempts}
          </span>
        )}
      </div>
    );
  return (
    <>
      {requestError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-error-foreground"
        >
          <p className="font-medium">Request not confirmed</p>
          <p>{requestError}</p>
          <p className="mt-1 text-xs">
            Retry request keeps the same idempotency key. Check status first if the connection was
            interrupted.
          </p>
        </div>
      )}
      {status && (
        <div
          role={failed ? 'alert' : 'status'}
          className={`rounded-lg border p-4 text-sm leading-6 ${failed ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/20'}`}
        >
          <div className="flex items-center gap-2">
            {failed && (
              <AlertCircle className="size-4 shrink-0 text-error-foreground" aria-hidden="true" />
            )}
            <p className="font-semibold">{status}</p>
          </div>
          <p className="mt-1 text-muted-foreground">
            {descriptions[status] ?? 'Unknown server state. Check status before continuing.'}
          </p>
          {job?.errorMessage && (
            <p className="mt-1 break-words text-error-foreground">{job.errorMessage}</p>
          )}
          {job && (
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Operation {job.id} · Attempts {job.attemptCount}/{job.maxAttempts}
              {job.nextAttemptAt && status === 'RETRY_WAIT'
                ? ` · Next ${new Date(job.nextAttemptAt).toLocaleString()}`
                : ''}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed px-5 py-7">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
