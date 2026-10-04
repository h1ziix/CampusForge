'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

interface NoteEditorProps {
  mode: 'create' | 'edit';
  workspaceId: string;
  noteId?: string;
  defaultTitle?: string;
  defaultContent?: string;
  onSave: (formData: FormData) => Promise<{ success: boolean; error?: string; noteId?: string }>;
  backHref: string;
}

/**
 * CampusForge note editor.
 * Full-page editor with title field and a plain textarea for markdown content.
 * Used for both create and edit flows. The onSave callback abstracts the server action.
 */
export function NoteEditor({
  mode,
  workspaceId,
  noteId,
  defaultTitle = '',
  defaultContent = '',
  onSave,
  backHref,
}: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState(defaultContent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = useCallback(() => {
    setError(null);

    const formData = new FormData();
    formData.set('title', title);
    formData.set('content', content);
    formData.set('workspaceId', workspaceId);
    if (noteId) formData.set('id', noteId);

    startTransition(async () => {
      const result = await onSave(formData);

      if (!result.success) {
        setError(result.error ?? 'Something went wrong');
        return;
      }

      if (mode === 'create' && result.noteId) {
        router.push(`/w/${workspaceId}/notes/${result.noteId}`);
      } else {
        router.refresh();
      }
    });
  }, [title, content, workspaceId, noteId, mode, onSave, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSave();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <Link href={backHref}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={isPending || !title.trim()} size="sm">
          <Save className="mr-2 h-4 w-4" />
          {isPending ? 'Saving...' : mode === 'create' ? 'Create Note' : 'Save'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            required
            maxLength={200}
            disabled={isPending}
            autoComplete="off"
            autoFocus
            className="border-none bg-transparent text-2xl font-bold placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Content — plain textarea, markdown-friendly */}
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing... (Markdown supported)"
            maxLength={50000}
            disabled={isPending}
            rows={20}
            className="flex min-h-[400px] w-full resize-y rounded-md border border-input bg-background px-4 py-3 font-mono text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </form>
    </div>
  );
}
