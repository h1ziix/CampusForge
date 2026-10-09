import { AppShell } from '@/components/layout/app-shell';
import { StudyDashboard } from '@/components/dashboard/study-dashboard';
import { DocumentList } from '@/components/document/document-list';
import { FlashcardSetDetailView } from '@/components/flashcard/flashcard-set-detail-view';
import { DocumentDetailView } from '@/components/document/document-detail-view';
import { AssistantApp } from '@/components/assistant/assistant-app';
import Link from 'next/link';
import { syntheticDocumentMetadata } from '@/fixture/document-metadata';

// Synthetic data only. Actual rendering components are copied unchanged at startup.
// This route is never copied into the application and does not connect to a DB/provider.
export default async function StudyFixture({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; view?: string; workspaceId?: string }>;
}) {
  const { state, view, workspaceId = 'r1-study-workspace' } = await searchParams;
  const documents =
    state === 'populated'
      ? ['COMPLETED', 'PENDING', 'FAILED'].map((status, i) => ({
          id: `r1-notes-${i}`,
          filename:
            i === 0
              ? 'Synthetic short notes.txt'
              : `Synthetic longer filename for layout checking ${i}.pdf`,
          mimeType: i === 0 ? 'text/plain' : 'application/pdf',
          sizeBytes: 512,
          processingStatus: status,
          hasSummary: false,
          createdAt: '2026-10-08T00:00:00Z',
          updatedAt: '2026-10-08T00:00:00Z',
        }))
      : [];
  const sets =
    state === 'populated'
      ? [
          {
            id: 'r1-saved-set',
            title: 'Synthetic saved study set',
            cardCount: 2,
            sourceDocumentId: 'r1-notes-0',
            sourceDocumentFilename: 'Synthetic short notes.txt',
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z',
          },
        ]
      : [];
  return (
    <AppShell
      user={{ id: 'r2-user-a', name: 'Synthetic learner' }}
      workspaces={[
        { id: workspaceId, name: 'Synthetic study workspace', type: 'PERSONAL', role: 'OWNER' },
        {
          id: 'r1-other-workspace',
          name: 'Other empty workspace',
          type: 'PERSONAL',
          role: 'OWNER',
        },
      ]}
    >
      {view === 'assistant' ? (
        <AssistantApp
          identity={{ userId: 'r2-user-a', workspaceId }}
          user={{ name: 'Synthetic learner' }}
        />
      ) : view === 'document' ? (
        <DocumentDetailView
          identity={{ userId: 'r2-user-a', workspaceId }}
          workspaceId={workspaceId}
          document={{
            ...documents[0],
            ...syntheticDocumentMetadata(),
          }}
          summary={null}
          summaryJob={null}
          flashcardSets={sets}
          flashcardJob={null}
        />
      ) : view === 'sets' ? (
        <div>
          <h1 className="text-2xl font-bold">Synthetic saved sets</h1>
          {sets.map((set) => (
            <p key={set.id}>
              <Link
                className="text-primary underline"
                href={`/w/${workspaceId}/flashcards/${set.id}`}
              >
                {set.title}
              </Link>
            </p>
          ))}
        </div>
      ) : view === 'documents' ? (
        <DocumentList workspaceId={workspaceId} documents={documents} />
      ) : view === 'study' ? (
        <FlashcardSetDetailView
          workspaceId={workspaceId}
          flashcardJob={null}
          flashcardSet={{
            ...sets[0],
            cards: [
              {
                front: 'What is a synthetic fixture?',
                back: 'Controlled test data, not a model response.',
              },
              { front: 'Does the preview analyse uploads?', back: 'No. It uses sample content.' },
            ],
          }}
        />
      ) : (
        <StudyDashboard
          workspaceId={workspaceId}
          workspaceName="Synthetic study workspace"
          documents={documents}
          flashcardSets={sets}
        />
      )}
    </AppShell>
  );
}
