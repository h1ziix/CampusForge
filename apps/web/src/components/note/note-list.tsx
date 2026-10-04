import Link from 'next/link';
import { Plus, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/note/note-card';
import type { NoteListItem } from '@/server/queries/note';

interface NoteListProps {
  notes: NoteListItem[];
  workspaceId: string;
}

/**
 * CampusForge notes list with empty state and create button.
 * Server component — no client interactivity needed for the list itself.
 */
export function NoteList({ notes, workspaceId }: NoteListProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
          <p className="text-muted-foreground">
            {notes.length === 0
              ? 'No notes yet. Create one to get started.'
              : `${notes.length} note${notes.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
        <Link href={`/w/${workspaceId}/notes/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Note
          </Button>
        </Link>
      </div>

      {/* Empty state */}
      {notes.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <StickyNote className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No notes yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Notes help you capture ideas, lecture summaries, and research findings. Start with your
            first note.
          </p>
          <Link href={`/w/${workspaceId}/notes/new`}>
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create First Note
            </Button>
          </Link>
        </div>
      )}

      {/* Note grid */}
      {notes.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the notes list.
 */
export function NoteListSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-24" />
          <Skeleton className="mt-2 h-5 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
