import { AppShell } from '@/components/layout/app-shell';
import { DocumentList } from '@/components/document/document-list';
import { DocumentDetailView } from '@/components/document/document-detail-view';
import { FlashcardSetList } from '@/components/flashcard/flashcard-set-list';
import { FlashcardSetDetailView } from '@/components/flashcard/flashcard-set-detail-view';
import { pilotDocuments, pilotSnapshot, pilotWorkspace } from '@/fixture/r3-pilot';
import { generationState } from '@/fixture/document-generation';

export const dynamic = 'force-dynamic';

export function PilotView({ section = 'documents', id }: { section?: string; id?: string }) {
  const state = pilotSnapshot();
  const set = id ? generationState().sets.get(id) : undefined;
  return (
    <AppShell
      user={{ id: 'r2-user-a', name: 'Synthetic learner' }}
      workspaces={[
        { id: pilotWorkspace, name: 'Exam preparation', type: 'PERSONAL', role: 'OWNER' },
        {
          id: 'r1-other-workspace',
          name: 'Other empty workspace',
          type: 'PERSONAL',
          role: 'OWNER',
        },
      ]}
    >
      {section === 'flashcards' ? (
        set ? (
          <FlashcardSetDetailView
            workspaceId={pilotWorkspace}
            flashcardJob={state.flashcardJob}
            flashcardSet={{ ...set, sourceDocumentFilename: state.document.filename }}
          />
        ) : (
          <FlashcardSetList workspaceId={pilotWorkspace} flashcardSets={state.flashcardSets} />
        )
      ) : id ? (
        <DocumentDetailView
          {...state}
          identity={{ userId: 'r2-user-a', workspaceId: pilotWorkspace }}
          workspaceId={pilotWorkspace}
        />
      ) : (
        <DocumentList workspaceId={pilotWorkspace} documents={pilotDocuments()} />
      )}
    </AppShell>
  );
}

export default function PilotFixture() {
  return <PilotView />;
}
