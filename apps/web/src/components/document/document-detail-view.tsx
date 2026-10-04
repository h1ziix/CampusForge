'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Loader2,
  Clock,
  RefreshCw,
  Layers,
  CheckCircle2,
  GraduationCap,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentStatusBadge } from '@/components/document/document-status-badge';
import { DOCUMENT_TYPE_LABELS } from '@campusforge/shared';
import { cn } from '@/lib/utils';
import { identityNamespace, type LocalIdentity, type SensitiveLease } from '@/lib/privacy';
import { SessionEnded, usePrivacyLease } from '@/lib/use-privacy-lease';
import type { DocumentDetail } from '@/server/queries/document';
import type { DocumentSummaryRow, AIJobRow } from '@/server/queries/summary';
import type { FlashcardSetListRow } from '@/server/queries/flashcard';

interface DocumentDetailViewProps {
  document: DocumentDetail;
  summary: DocumentSummaryRow | null;
  summaryJob: AIJobRow | null;
  flashcardSets: FlashcardSetListRow[];
  flashcardJob: AIJobRow | null;
  workspaceId: string;
  identity: LocalIdentity;
}

interface DemoSummary {
  intro: string;
  keyPoints: string[];
  assessment: string;
  readingTime: string;
}

interface Flashcard {
  question: string;
  answer: string;
}

type GenState = 'idle' | 'loading' | 'done';

/** Format bytes to human-readable size */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const storageKey = (identity: LocalIdentity, id: string) =>
  `campusforge:doc-ai:v2:${identityNamespace(identity)}:${encodeURIComponent(id)}`;

function loadCache(
  identity: LocalIdentity,
  id: string,
  lease: SensitiveLease,
): { summary?: DemoSummary; flashcards?: Flashcard[] } {
  if (!lease.isValid()) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(identity, id));
    if (!raw) return {};
    const saved = JSON.parse(raw) as {
      epoch?: string;
      summary?: DemoSummary;
      flashcards?: Flashcard[];
    };
    if (saved.epoch !== lease.epoch) return {};
    const summary =
      saved.summary &&
      typeof saved.summary.intro === 'string' &&
      typeof saved.summary.assessment === 'string' &&
      typeof saved.summary.readingTime === 'string' &&
      Array.isArray(saved.summary.keyPoints) &&
      saved.summary.keyPoints.every((point) => typeof point === 'string')
        ? saved.summary
        : undefined;
    const flashcards =
      Array.isArray(saved.flashcards) &&
      saved.flashcards.every(
        (card) => card && typeof card.question === 'string' && typeof card.answer === 'string',
      )
        ? saved.flashcards
        : undefined;
    return { summary, flashcards };
  } catch {
    return {};
  }
}

function buildSummary(filename: string): DemoSummary {
  const name = filename.replace(/\.[^.]+$/, '').trim() || 'the uploaded material';
  return {
    intro: `This document provides an overview of ${name} and highlights the key information it contains.`,
    keyPoints: [
      'Introduces the primary objectives and scope.',
      'Explains the core concepts and supporting details.',
      'Identifies important recommendations.',
      'Summarizes major conclusions.',
      'Highlights actionable next steps.',
    ],
    assessment:
      'The document is well structured and covers its topic clearly. Recommended reading time: approximately 8–10 minutes.',
    readingTime: '8–10 min read',
  };
}

const DEMO_FLASHCARDS: Flashcard[] = [
  {
    question: 'What is the main objective of this document?',
    answer: 'To explain the core concepts and provide practical recommendations.',
  },
  {
    question: 'What are the key takeaways?',
    answer: 'Objectives, methodology, recommendations and conclusions.',
  },
  {
    question: 'What should the reader remember?',
    answer: 'Focus on the implementation strategy and final recommendations.',
  },
  {
    question: 'Which section contains the most important information?',
    answer: 'The recommendations and conclusion.',
  },
  {
    question: 'Who is the intended audience?',
    answer: 'Students, researchers and project teams.',
  },
  {
    question: 'What is the next recommended action?',
    answer: 'Review the summary and apply the listed recommendations.',
  },
];

/**
 * CampusForge document detail view.
 *
 * AI summary + flashcard generation run entirely client-side as a simulated,
 * offline experience — no API calls, no backend, no error states. Generated
 * results persist per-document in localStorage so the page feels lived-in.
 */
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
  if (!lease) return <div className="min-h-[50vh]" aria-busy="true" />;
  return <DocumentSession {...props} lease={lease} />;
}

function DocumentSession({
  document: doc,
  workspaceId,
  identity,
  lease,
}: DocumentDetailViewProps & { lease: SensitiveLease }) {
  const [initial] = useState(() => loadCache(identity, doc.id, lease));
  const [summaryState, setSummaryState] = useState<GenState>(initial.summary ? 'done' : 'idle');
  const [summaryData, setSummaryData] = useState<DemoSummary | null>(initial.summary ?? null);

  const [flashcardState, setFlashcardState] = useState<GenState>(
    initial.flashcards?.length ? 'done' : 'idle',
  );
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initial.flashcards ?? []);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const timers = useRef<number[]>([]);

  // Persist generated results.
  useEffect(() => {
    if (!lease.isValid()) return;
    try {
      window.localStorage.setItem(
        storageKey(identity, doc.id),
        JSON.stringify({
          epoch: lease.epoch,
          summary: summaryState === 'done' ? summaryData : undefined,
          flashcards: flashcardState === 'done' ? flashcards : undefined,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [identity, lease, doc.id, summaryState, summaryData, flashcardState, flashcards]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const handleGenerateSummary = useCallback(() => {
    setSummaryState('loading');
    const delay = 1500 + Math.random() * 1000; // 1.5–2.5s
    const t = window.setTimeout(() => {
      if (!lease.isValid()) return;
      setSummaryData(buildSummary(doc.filename));
      setSummaryState('done');
    }, delay);
    timers.current.push(t);
  }, [doc.filename, lease]);

  const handleGenerateFlashcards = useCallback(() => {
    setFlashcardState('loading');
    setFlipped({});
    const t = window.setTimeout(() => {
      if (!lease.isValid()) return;
      setFlashcards(DEMO_FLASHCARDS);
      setFlashcardState('done');
    }, 2000);
    timers.current.push(t);
  }, [lease]);

  return (
    <div>
      {/* Back navigation */}
      <Link
        href={`/w/${workspaceId}/documents`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Documents
      </Link>

      {/* Document header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{doc.filename}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[doc.mimeType] ?? doc.mimeType}
              {' · '}
              {formatBytes(doc.sizeBytes)}
              {' · '}
              Uploaded {new Date(doc.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <DocumentStatusBadge status={doc.processingStatus} />
      </div>

      {/* Summary section */}
      <section className="mt-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-[18px] w-[18px] text-primary" />
            <h2 className="text-lg font-semibold">AI Summary</h2>
          </div>
          <Button
            onClick={handleGenerateSummary}
            disabled={summaryState === 'loading'}
            size="sm"
            className="shadow-sm transition-transform active:scale-95"
          >
            {summaryState === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Summary...
              </>
            ) : summaryState === 'done' ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Summary
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Summary
              </>
            )}
          </Button>
        </div>

        {summaryState === 'loading' && <SummarySkeleton />}

        {summaryState === 'idle' && (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="No summary yet"
            description="AI can generate a structured summary of this document with key points and an overall assessment."
          />
        )}

        {summaryState === 'done' && summaryData && (
          <Card className="animate-fade-in-up overflow-hidden border shadow-sm">
            {/* Premium header */}
            <div className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-600 text-white shadow-sm">
                  <Sparkles className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">AI Summary</p>
                  <p className="text-xs text-muted-foreground">Generated just now</p>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {summaryData.readingTime}
              </Badge>
            </div>

            <CardContent className="space-y-6 p-5">
              <p className="leading-relaxed text-foreground/90">{summaryData.intro}</p>

              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Key Points
                </h3>
                <ul className="space-y-2.5">
                  {summaryData.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                      <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4">
                <h3 className="mb-1.5 text-sm font-semibold">Overall Assessment</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {summaryData.assessment}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Flashcard section */}
      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-[18px] w-[18px] text-primary" />
            <h2 className="text-lg font-semibold">Flashcards</h2>
            {flashcardState === 'done' && (
              <Badge variant="secondary">{flashcards.length} cards</Badge>
            )}
          </div>
          <Button
            onClick={handleGenerateFlashcards}
            disabled={flashcardState === 'loading'}
            size="sm"
            variant="outline"
            className="shadow-sm transition-transform active:scale-95"
          >
            {flashcardState === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Flashcards...
              </>
            ) : flashcardState === 'done' ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </>
            ) : (
              <>
                <Layers className="mr-2 h-4 w-4" />
                Generate Flashcards
              </>
            )}
          </Button>
        </div>

        {flashcardState === 'loading' && <FlashcardSkeleton />}

        {flashcardState === 'idle' && (
          <EmptyState
            icon={<GraduationCap className="h-6 w-6" />}
            title="Study flashcards"
            description="AI can generate study flashcards from this document."
          />
        )}

        {flashcardState === 'done' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {flashcards.map((card, i) => {
              const isFlipped = !!flipped[i];
              return (
                <button
                  key={i}
                  onClick={() => setFlipped((p) => ({ ...p, [i]: !p[i] }))}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="animate-fade-in-up group flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Card {i + 1}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn('transition-colors', isFlipped && 'bg-primary/10 text-primary')}
                    >
                      {isFlipped ? 'Answer' : 'Question'}
                    </Badge>
                  </div>

                  <p className="text-sm font-medium leading-relaxed">{card.question}</p>

                  <div
                    className={cn(
                      'grid transition-all duration-300',
                      isFlipped ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t pt-3 text-sm leading-relaxed text-muted-foreground">
                        {card.answer}
                      </div>
                    </div>
                  </div>

                  {!isFlipped && (
                    <span className="mt-3 text-xs text-muted-foreground/70 transition-colors group-hover:text-primary">
                      Click to reveal answer
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center justify-center py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="mt-4 text-sm font-semibold">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <Card className="overflow-hidden border shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-[80%]" style={{ width: `${88 - i * 9}%` }} />
            </div>
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

function FlashcardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
