'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DocumentStatusBadge } from '@/components/document/document-status-badge';
import { UploadDocumentDialog } from '@/components/document/upload-document-dialog';
import { deleteDocumentAction } from '@/server/actions/document';
import { DOCUMENT_TYPE_LABELS } from '@campusforge/shared';
import type { DocumentRow } from '@/server/queries/document';

interface DocumentListProps {
  documents: DocumentRow[];
  workspaceId: string;
}

/** Format bytes to human-readable size */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * CampusForge document list with empty state, upload button, and delete flow.
 * Client component that manages dialog state and delete transitions.
 * Document rows link to the detail page where summaries can be generated.
 */
export function DocumentList({ documents, workspaceId }: DocumentListProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent, documentId: string) {
    e.preventDefault(); // Prevent link navigation
    e.stopPropagation();
    if (!confirm('Delete this document? This cannot be undone.')) return;

    setDeletingId(documentId);
    const formData = new FormData();
    formData.set('documentId', documentId);
    formData.set('workspaceId', workspaceId);

    startTransition(async () => {
      const result = await deleteDocumentAction(formData);

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
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            {documents.length === 0
              ? 'No documents yet. Upload one to get started.'
              : `${documents.length} document${documents.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No documents yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Upload lecture notes, PDFs, or text files. Text is extracted automatically for use with
            flashcards, quizzes, and summaries.
          </p>
          <Button onClick={() => setUploadOpen(true)} className="mt-4">
            <Upload className="mr-2 h-4 w-4" />
            Upload First Document
          </Button>
        </div>
      )}

      {/* Document rows */}
      {documents.length > 0 && (
        <div className="mt-6 space-y-2">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/w/${workspaceId}/documents/${doc.id}`}
              className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              {/* File icon */}
              <div className="shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Filename + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.filename}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[doc.mimeType] ?? doc.mimeType}
                  {' · '}
                  {formatBytes(doc.sizeBytes)}
                  {' · '}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Status + actions */}
              <div className="flex shrink-0 items-center gap-2">
                {doc.hasSummary && (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Summary
                  </Badge>
                )}
                <DocumentStatusBadge status={doc.processingStatus} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(e, doc.id)}
                  disabled={isPending && deletingId === doc.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}

/**
 * Loading skeleton for the document list.
 * Shown while server data is loading.
 */
export function DocumentListSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
