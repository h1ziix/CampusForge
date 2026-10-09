'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Layers, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { deleteFlashcardSetAction } from '@/server/actions/flashcard';
import type { FlashcardSetListRow } from '@/server/queries/flashcard';

interface FlashcardSetListProps {
  flashcardSets: FlashcardSetListRow[];
  workspaceId: string;
}

/**
 * CampusForge flashcard set list with empty state and delete flow.
 * Client component that manages delete transitions.
 * Rows link to the detail/study page.
 */
export function FlashcardSetList({ flashcardSets, workspaceId }: FlashcardSetListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(flashcardSetId: string) {
    if (!confirm('Delete this flashcard set? This cannot be undone.')) return;

    setDeletingId(flashcardSetId);
    const formData = new FormData();
    formData.set('flashcardSetId', flashcardSetId);
    formData.set('workspaceId', workspaceId);

    startTransition(async () => {
      const result = await deleteFlashcardSetAction(formData);

      if (!result.success) {
        alert(result.error);
      }

      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
          <p className="text-muted-foreground">
            {flashcardSets.length === 0
              ? 'No saved flashcard sets in this workspace yet.'
              : `${flashcardSets.length} flashcard set${flashcardSets.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {flashcardSets.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <Layers className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No flashcards yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Generate flashcards from a document after its text is extracted. Your saved sets will
            appear here, ready to open in Study.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/w/${workspaceId}/documents`}>
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              Go to Documents
            </Link>
          </Button>
        </div>
      )}

      {/* Flashcard set rows */}
      {flashcardSets.length > 0 && (
        <div className="mt-6 space-y-2">
          {flashcardSets.map((set) => (
            <div
              key={set.id}
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-4"
            >
              <Link
                href={`/w/${workspaceId}/flashcards/${set.id}`}
                className="flex min-w-0 flex-1 basis-full items-start gap-3 rounded-md hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:basis-0"
              >
                <Layers
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium [overflow-wrap:anywhere]">{set.title}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
                    {set.sourceDocumentFilename && (
                      <>
                        {' · '}
                        from {set.sourceDocumentFilename}
                      </>
                    )}
                    {' · '}
                    {new Date(set.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>

              {/* Badges + actions */}
              <div className="flex w-full flex-wrap items-center gap-2 pl-8 lg:w-auto lg:shrink-0 lg:pl-0">
                <Badge variant="secondary">
                  {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(set.id)}
                  disabled={isPending && deletingId === set.id}
                  aria-label={`Delete ${set.title}`}
                  className="ml-auto text-muted-foreground hover:text-destructive lg:ml-0"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the flashcard set list.
 * Shown while server data is loading.
 */
export function FlashcardSetListSkeleton() {
  return (
    <div role="status" aria-label="Loading flashcard sets" aria-busy="true">
      <span className="sr-only">Loading flashcard sets...</span>
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-5 w-56 max-w-full" />
        </div>
      </div>
      <div aria-hidden="true" className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
