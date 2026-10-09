'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  resolveDocumentMimeType,
} from '@campusforge/shared';

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

/** Human-readable accept string for the file input */
const ACCEPT_STRING = '.pdf,.txt,.md,.markdown';

/** Format bytes to human-readable size */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * CampusForge document upload dialog.
 *
 * Allows the user to select a file, validates type and size client-side,
 * then uploads via the Route Handler at /api/workspaces/[id]/documents/upload.
 *
 * Shows progress feedback during upload. On success, refreshes the page
 * to show the new document in the list.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  workspaceId,
  returnFocusRef,
}: UploadDocumentDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function reset() {
    setSelectedFile(null);
    setError(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSelectedFile(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (
      !(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(
        resolveDocumentMimeType(file.name, file.type),
      )
    ) {
      setError('Unsupported file type. Allowed: PDF, TXT, Markdown.');
      return;
    }

    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError(`File too large (${formatBytes(file.size)}). Max: 10 MiB.`);
      return;
    }

    if (file.size === 0) {
      setError('File is empty.');
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`/api/workspaces/${workspaceId}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? 'Upload failed. Please try again.');
        return;
      }

      // Success — close dialog and refresh page
      handleOpenChange(false);
      router.refresh();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-lg sm:max-w-[480px]"
        aria-busy={isUploading}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Start with a short UTF-8 TXT note. Upload one PDF with selectable text, TXT, or Markdown
            file up to 10 MiB. Once saved, it is queued for text extraction.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Scans, images, and DOCX are not supported. Markdown with an empty browser MIME is
            accepted by extension; the server still checks encoding and content.
          </p>
          <p>
            Uploading does not start AI generation. Open the saved document to check its actual AI
            input budget and request a summary or flashcards. Text that exceeds this budget is
            rejected without truncation.
          </p>
        </div>

        <div className="space-y-4 py-2">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-error-foreground"
            >
              {error}
            </div>
          )}

          {/* File input */}
          {!selectedFile ? (
            <div className="rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Label htmlFor="doc-file">Select file</Label>
              <label
                htmlFor="doc-file"
                className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 transition-colors hover:border-muted-foreground/50"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Click to select a file</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, TXT, or Markdown up to 10 MiB
                </p>
              </label>
              <input
                ref={fileInputRef}
                id="doc-file"
                type="file"
                accept={ACCEPT_STRING}
                onChange={handleFileSelect}
                className="sr-only"
                disabled={isUploading}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploading}
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {isUploading ? 'Uploading your file. Waiting for the server to confirm it is saved.' : ''}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            className="dark:text-white"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
