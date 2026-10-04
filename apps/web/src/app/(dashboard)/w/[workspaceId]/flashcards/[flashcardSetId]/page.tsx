import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getFlashcardSetById } from '@/server/queries/flashcard';
import { getLatestAIJob } from '@/server/queries/summary';
import { FlashcardSetDetailView } from '@/components/flashcard/flashcard-set-detail-view';

export const metadata: Metadata = {
  title: 'Flashcard Set',
};

/**
 * CampusForge flashcard set detail page — shows flashcard viewer
 * and full card list for study.
 */
export default async function FlashcardSetDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string; flashcardSetId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const flashcardSet = await getFlashcardSetById(params.flashcardSetId, params.workspaceId);
  if (!flashcardSet) notFound();

  // Fetch the latest flashcard AI job for the source document (for metadata display)
  const flashcardJob = flashcardSet.sourceDocumentId
    ? await getLatestAIJob(flashcardSet.sourceDocumentId, 'FLASHCARD')
    : null;

  return (
    <div className="space-y-6">
      <FlashcardSetDetailView
        flashcardSet={flashcardSet}
        flashcardJob={flashcardJob}
        workspaceId={params.workspaceId}
      />
    </div>
  );
}
