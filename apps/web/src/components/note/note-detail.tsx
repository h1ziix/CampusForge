'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { NOTE_SOURCE_LABELS } from '@campusforge/shared';
import type { NoteRow } from '@/server/queries/note';

interface NoteDetailProps {
  note: NoteRow;
  workspaceId: string;
}

/**
 * CampusForge note detail view.
 * Shows the full note content with title, metadata, and an edit button.
 * Content is rendered as preformatted text (markdown rendering is Phase 3).
 */
export function NoteDetail({ note, workspaceId }: NoteDetailProps) {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <Link href={`/w/${workspaceId}/notes`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All Notes
          </Button>
        </Link>
        <Link href={`/w/${workspaceId}/notes/${note.id}?edit=true`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Title + metadata */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{note.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span>Updated {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</span>
          {note.sourceType !== 'MANUAL' && (
            <Badge variant="secondary" className="text-xs">
              {NOTE_SOURCE_LABELS[note.sourceType] ?? note.sourceType}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Content */}
      {note.content ? (
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{note.content}</div>
      ) : (
        <p className="py-8 text-center text-sm italic text-muted-foreground">
          This note is empty. Click Edit to add content.
        </p>
      )}
    </div>
  );
}
