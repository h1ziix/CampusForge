'use client';

import { useRef, useState, useTransition } from 'react';
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
 * Document rows link to saved server results and generation status.
 */
export function DocumentList({ documents, workspaceId }: DocumentListProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const uploadTriggerRef = useRef<HTMLButtonElement | null>(null);

  function openUpload(event: React.MouseEvent<HTMLButtonElement>) {
    uploadTriggerRef.current = event.currentTarget;
    setUploadOpen(true);
  }

  function handleDelete(documentId: string) {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            {documents.length === 0
              ? 'Your workspace is empty. Start with a short note.'
              : `${documents.length} document${documents.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
        <Button onClick={openUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Upload saves your file for text extraction. Open a document to check its AI input budget,
        request a summary or flashcards, and follow the server status. Saved sets open in Study.
      </p>

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No documents yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Use a short UTF-8 TXT note, Markdown file, or PDF with selectable text. Upload one file
            up to 10 MiB; scans, images, and DOCX are not supported.
          </p>
          <Button onClick={openUpload} className="mt-4">
            <Upload className="mr-2 h-4 w-4" />
            Upload First Document
          </Button>
        </div>
      )}

      {/* Document rows */}
      {documents.length > 0 && (
        <ul className="mt-6 flex min-w-0 flex-col gap-2" aria-label="Documents">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border bg-card p-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <Link
                href={`/w/${workspaceId}/documents/${doc.id}`}
                aria-label={`Open ${doc.filename}`}
                className="col-span-2 flex min-w-0 items-center gap-3 rounded-md hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:col-span-1"
              >
                {/* File icon */}
                <div className="shrink-0">
                  <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>

                {/* Filename + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {DOCUMENT_TYPE_LABELS[doc.mimeType] ?? doc.mimeType}
                    {' · '}
                    {formatBytes(doc.sizeBytes)}
                    {' · '}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>

              {/* Status + actions */}
              <div className="flex min-w-0 flex-wrap items-center gap-2 pl-8 xl:pl-0">
                {doc.hasSummary && (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Summary
                  </Badge>
                )}
                <DocumentStatusBadge status={doc.processingStatus} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(doc.id)}
                disabled={isPending && deletingId === doc.id}
                aria-label={`Delete ${doc.filename}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Upload dialog */}
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId={workspaceId}
        returnFocusRef={uploadTriggerRef}
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
    <div role="status" aria-label="Loading documents" aria-busy="true">
      <span className="sr-only">Loading documents...</span>
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div aria-hidden="true" className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
