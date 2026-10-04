import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getWorkspaceFlashcardSets } from '@/server/queries/flashcard';
import { FlashcardSetList } from '@/components/flashcard/flashcard-set-list';

export const metadata: Metadata = {
  title: 'Flashcards',
};

/**
 * CampusForge flashcard list page — workspace-scoped.
 *
 * Server component that fetches all flashcard sets for the workspace,
 * then passes them to the client-side FlashcardSetList component.
 */
export default async function FlashcardsPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const flashcardSets = await getWorkspaceFlashcardSets(params.workspaceId);

  return (
    <div className="space-y-6">
      <FlashcardSetList flashcardSets={flashcardSets} workspaceId={params.workspaceId} />
    </div>
  );
}
