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

  function handleDelete(e: React.MouseEvent, flashcardSetId: string) {
    e.preventDefault();
    e.stopPropagation();
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
              ? 'No flashcard sets yet. Generate them from your documents.'
              : `${flashcardSets.length} flashcard set${flashcardSets.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {flashcardSets.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <Layers className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No flashcards yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Flashcard sets are generated from your uploaded documents. Go to a document and click
            &quot;Generate Flashcards&quot; to create a set.
          </p>
          <Link href={`/w/${workspaceId}/documents`}>
            <Button className="mt-4">
              <FileText className="mr-2 h-4 w-4" />
              Go to Documents
            </Button>
          </Link>
        </div>
      )}

      {/* Flashcard set rows */}
      {flashcardSets.length > 0 && (
        <div className="mt-6 space-y-2">
          {flashcardSets.map((set) => (
            <Link
              key={set.id}
              href={`/w/${workspaceId}/flashcards/${set.id}`}
              className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              {/* Icon */}
              <div className="shrink-0">
                <Layers className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Title + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{set.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
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

              {/* Badges + actions */}
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{set.cardCount} cards</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(e, set.id)}
                  disabled={isPending && deletingId === set.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Link>
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
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-5 w-56" />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
