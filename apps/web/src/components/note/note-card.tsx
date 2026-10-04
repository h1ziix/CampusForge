import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { NoteListItem } from '@/server/queries/note';
import { NOTE_SOURCE_LABELS } from '@campusforge/shared';

interface NoteCardProps {
  note: NoteListItem;
  workspaceId: string;
}

/**
 * CampusForge note card for the list view.
 * Shows title, excerpt, source badge, and relative time.
 * Entire card is a link to the note detail page.
 */
export function NoteCard({ note, workspaceId }: NoteCardProps) {
  return (
    <Link href={`/w/${workspaceId}/notes/${note.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-1 text-base leading-snug">{note.title}</CardTitle>
            {note.sourceType !== 'MANUAL' && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {NOTE_SOURCE_LABELS[note.sourceType] ?? note.sourceType}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {note.excerpt ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{note.excerpt}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">Empty note</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Updated {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
