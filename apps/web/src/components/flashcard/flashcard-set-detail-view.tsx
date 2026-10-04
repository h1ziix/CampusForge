'use client';

import { ArrowLeft, Clock, Hash, Coins, Layers } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlashcardViewer } from '@/components/flashcard/flashcard-viewer';
import type { FlashcardSetDetailRow } from '@/server/queries/flashcard';
import type { AIJobRow } from '@/server/queries/summary';

interface FlashcardSetDetailViewProps {
  flashcardSet: FlashcardSetDetailRow;
  flashcardJob: AIJobRow | null;
  workspaceId: string;
}

/**
 * CampusForge flashcard set detail view.
 *
 * Includes:
 * - Set metadata header
 * - Interactive flashcard study viewer (flip, navigate, shuffle)
 * - All cards listed for reference
 * - AI job metadata footer
 */
export function FlashcardSetDetailView({
  flashcardSet,
  flashcardJob,
  workspaceId,
}: FlashcardSetDetailViewProps) {
  return (
    <div>
      {/* Back navigation */}
      <Link
        href={`/w/${workspaceId}/flashcards`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Flashcards
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 shrink-0">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{flashcardSet.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {flashcardSet.cardCount} card{flashcardSet.cardCount === 1 ? '' : 's'}
              {flashcardSet.sourceDocumentFilename && (
                <>
                  {' · '}
                  Generated from{' '}
                  {flashcardSet.sourceDocumentId ? (
                    <Link
                      href={`/w/${workspaceId}/documents/${flashcardSet.sourceDocumentId}`}
                      className="underline hover:text-foreground"
                    >
                      {flashcardSet.sourceDocumentFilename}
                    </Link>
                  ) : (
                    flashcardSet.sourceDocumentFilename
                  )}
                </>
              )}
              {' · '}
              Created {new Date(flashcardSet.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Layers className="h-3 w-3" />
          {flashcardSet.cardCount} cards
        </Badge>
      </div>

      {/* Study mode */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Study Mode</h2>
        <FlashcardViewer cards={flashcardSet.cards} title={flashcardSet.title} />
      </div>

      {/* All cards reference list */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">All Cards</h2>
        <div className="space-y-3">
          {flashcardSet.cards.map((card, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Card {i + 1}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Front
                  </span>
                  <p className="mt-0.5 text-sm">{card.front}</p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Back
                  </span>
                  <p className="mt-0.5 text-sm text-muted-foreground">{card.back}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Job metadata (if available) */}
      {flashcardJob?.status === 'COMPLETED' && (
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {flashcardJob.latencyMs != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {(flashcardJob.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
          {flashcardJob.tokenUsage != null && (
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {flashcardJob.tokenUsage.toLocaleString()} tokens
            </span>
          )}
          {flashcardJob.estimatedCost != null && flashcardJob.estimatedCost > 0 && (
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3" />${flashcardJob.estimatedCost.toFixed(4)}
            </span>
          )}
          <span>Generated {new Date(flashcardJob.updatedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
