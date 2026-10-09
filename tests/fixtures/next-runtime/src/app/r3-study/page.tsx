import { FlashcardViewer } from '@/components/flashcard/flashcard-viewer';
import { FlashcardSetDetailView } from '@/components/flashcard/flashcard-set-detail-view';
import { StudyFixtureControls } from './controls';

// Synthetic data; the viewer is copied from the actual application at fixture startup.
export default async function StudyFixture({
  searchParams,
}: {
  searchParams: Promise<{ long?: string; empty?: string; detail?: string }>;
}) {
  const { long, empty, detail } = await searchParams;
  const repeated = 'Long source notes remain readable and reachable while studying. '.repeat(32);
  const cards = empty
    ? []
    : [
        {
          front: long ? `${repeated}QUESTION-END-${'Q'.repeat(180)}` : 'First study question',
          back: long ? `${repeated}ANSWER-END-${'A'.repeat(180)}` : 'First study answer',
        },
        { front: 'Second study question', back: 'Second study answer' },
        { front: 'Third study question', back: 'Third study answer' },
      ];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Study keyboard regression</h1>
      <StudyFixtureControls />
      {detail ? (
        <FlashcardSetDetailView
          workspaceId="r3-study-workspace"
          flashcardJob={null}
          flashcardSet={{
            id: 'r3-study-set',
            title: 'Long source practice',
            cards,
            cardCount: cards.length,
            sourceDocumentId: 'r3-source',
            sourceDocumentFilename: `SourceFilename${'F'.repeat(180)}.txt`,
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z',
          }}
        />
      ) : (
        <FlashcardViewer
          title={long ? `LongStudyTitle${'T'.repeat(180)}` : 'Synthetic keyboard practice'}
          cards={cards}
        />
      )}
      <p id="study-destination" className="mt-8">
        Outside link destination
      </p>
    </main>
  );
}
