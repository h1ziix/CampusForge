'use client';

import { useEffect, useState } from 'react';
import { DocumentDetailView } from '@/components/document/document-detail-view';
import { UploadDocumentDialog } from '@/components/document/upload-document-dialog';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { syntheticDocumentMetadata } from '@/fixture/document-metadata';
import { setSyntheticParseStatusAction } from '@/server/actions/document';

export default function R3DocumentStates() {
  const [status, setStatus] = useState('PENDING');
  const [uploadOpen, setUploadOpen] = useState(false);
  useEffect(() => {
    void setSyntheticParseStatusAction('PENDING');
  }, []);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-wrap gap-2">
        <ThemeToggle />
        {['PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'].map((value) => (
          <Button
            key={value}
            variant="outline"
            onClick={async () => {
              await setSyntheticParseStatusAction(value);
              setStatus(value);
            }}
          >
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
          ...syntheticDocumentMetadata(status),
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
