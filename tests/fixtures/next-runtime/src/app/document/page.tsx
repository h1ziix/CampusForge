'use client';

import { DocumentDetailView } from '@/components/document/document-detail-view';

export default function DocumentRegression() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <DocumentDetailView
        identity={{ userId: 'r1-synthetic-user', workspaceId: 'r1-synthetic-workspace' }}
        document={{
          id: 'r1-synthetic-document',
          filename: 'synthetic.txt',
          mimeType: 'text/plain',
          sizeBytes: 17,
          processingStatus: 'COMPLETED',
          hasSummary: false,
          createdAt: '2026-10-04T00:00:00Z',
          updatedAt: '2026-10-04T00:00:00Z',
          parsedText: 'Synthetic content',
          storageKey: 'synthetic',
        }}
        summary={null}
        summaryJob={null}
        flashcardSets={[]}
        flashcardJob={null}
        workspaceId="r1-synthetic-workspace"
      />
    </main>
  );
}
