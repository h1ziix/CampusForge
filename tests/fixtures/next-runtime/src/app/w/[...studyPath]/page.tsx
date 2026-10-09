import StudyFixture from '../../r1-study/page';
import { FlashcardSetDetailView } from '@/components/flashcard/flashcard-set-detail-view';
import { generationState } from '@/fixture/document-generation';
import { PilotView } from '../../r3-pilot/page';

export default async function StudyDestination({
  params,
}: {
  params: Promise<{ studyPath: string[] }>;
}) {
  const { studyPath } = await params;
  const [workspaceId, section, id] = studyPath;
  if (workspaceId === 'r3-pilot-workspace') return <PilotView section={section} id={id} />;
  if (workspaceId === 'r2-generation-workspace' && section === 'flashcards' && id) {
    const set = generationState().sets.get(id);
    if (!set) return <main>Saved synthetic set not found.</main>;
    return (
      <main className="mx-auto max-w-3xl p-6">
        <FlashcardSetDetailView workspaceId={workspaceId} flashcardJob={null} flashcardSet={set} />
      </main>
    );
  }
  return (
    <StudyFixture
      searchParams={Promise.resolve({
        state: workspaceId === 'r1-study-workspace' ? 'populated' : 'empty',
        view:
          section === 'assistant'
            ? 'assistant'
            : section === 'documents'
              ? id
                ? 'document'
                : 'documents'
              : section === 'flashcards'
                ? id
                  ? 'study'
                  : 'sets'
                : undefined,
        workspaceId,
      })}
    />
  );
}
