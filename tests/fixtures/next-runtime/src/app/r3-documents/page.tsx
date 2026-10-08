'use client';

import { useState } from 'react';
import { DocumentDetailView } from '@/components/document/document-detail-view';
import { UploadDocumentDialog } from '@/components/document/upload-document-dialog';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function R3DocumentStates() {
  const [status, setStatus] = useState('PENDING');
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-wrap gap-2">
        <ThemeToggle />
        {['PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'].map((value) => (
          <Button key={value} variant="outline" onClick={() => setStatus(value)}>
            {value}
          </Button>
        ))}
        <Button onClick={() => setUploadOpen(true)}>Open upload fixture</Button>
      </div>
      <DocumentDetailView
        identity={{ userId: 'r3-synthetic-user', workspaceId: 'r3-synthetic-workspace' }}
        document={{
          id: 'r3-synthetic-document',
          filename: 'lecture-notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 17,
          processingStatus: status,
          hasSummary: false,
          createdAt: '2026-10-05T00:00:00Z',
          updatedAt: '2026-10-05T00:00:00Z',
          parsedText: status === 'COMPLETED' ? 'Synthetic content' : null,
          storageKey: 'synthetic',
        }}
        summary={null}
        summaryJob={null}
        flashcardSets={[]}
        flashcardJob={null}
        workspaceId="r3-synthetic-workspace"
      />
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId="r3-synthetic-workspace"
      />
    </main>
  );
}
