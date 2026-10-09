import { AppShell } from '@/components/layout/app-shell';
import {
  FlashcardSetList,
  FlashcardSetListSkeleton,
} from '@/components/flashcard/flashcard-set-list';

const title = 'Synthetic practice set for a permitted source';

// Production UI with synthetic metadata only; no real documents or persistence.
export default async function SetListFixture({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <AppShell
      user={{ id: 'r3-set-list-user', name: 'Synthetic learner' }}
      workspaces={[
        {
          id: 'r3-set-list-workspace',
          name: 'Synthetic study workspace',
          type: 'PERSONAL',
          role: 'OWNER',
        },
      ]}
    >
      {state === 'loading' ? (
        <FlashcardSetListSkeleton />
      ) : (
        <FlashcardSetList
          workspaceId="r3-set-list-workspace"
          flashcardSets={
            state === 'empty'
              ? []
              : [
                  {
                    id: 'r3-synthetic-set',
                    title,
                    cardCount: 2,
                    sourceDocumentId: 'r3-synthetic-document',
                    sourceDocumentFilename: `${'LongPermittedSource'.repeat(14)}.txt`,
                    createdAt: '2026-10-08T00:00:00Z',
                    updatedAt: '2026-10-08T00:00:00Z',
                  },
                ]
          }
        />
      )}
    </AppShell>
  );
}
