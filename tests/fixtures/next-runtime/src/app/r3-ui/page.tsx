import { AppShell } from '@/components/layout/app-shell';
import { DocumentList, DocumentListSkeleton } from '@/components/document/document-list';
import DocumentDetailLoading from '@/app/(dashboard)/w/[workspaceId]/documents/[documentId]/loading';

export default async function DocumentUIFixture({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const documents = ['PROCESSING', 'PENDING', 'FAILED', 'COMPLETED'].map((status, index) => ({
    id: `document-${index}`,
    filename: `${'LongSyntheticFilename'.repeat(12)}-${index}.txt`,
    mimeType: 'text/plain',
    sizeBytes: 1024,
    processingStatus: status,
    hasSummary: true,
    createdAt: '2026-10-08T00:00:00Z',
    updatedAt: '2026-10-08T00:00:00Z',
  }));
  return (
    <AppShell
      user={{ id: 'r2-user-a', name: 'Synthetic learner' }}
      workspaces={[
        { id: 'r3-ui-workspace', name: 'Study workspace', type: 'PERSONAL', role: 'OWNER' },
      ]}
    >
      {state === 'loading' ? (
        <DocumentListSkeleton />
      ) : state === 'detail-loading' ? (
        <DocumentDetailLoading />
      ) : (
        <DocumentList
          workspaceId="r3-ui-workspace"
          documents={state === 'empty' ? [] : documents}
        />
      )}
    </AppShell>
  );
}
