import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getWorkspaceForUser } from '@/server/queries/workspace';
import { getRecentDocuments } from '@/server/queries/document';
import { getWorkspaceFlashcardSets } from '@/server/queries/flashcard';
import { StudyDashboard } from '@/components/dashboard/study-dashboard';

export const metadata: Metadata = { title: 'Study workspace' };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();
  const workspace = await getWorkspaceForUser(workspaceId, session.user.id);
  if (!workspace) notFound();
  const [documents, flashcardSets] = await Promise.all([
    getRecentDocuments(workspaceId, 5),
    getWorkspaceFlashcardSets(workspaceId, 5),
  ]);
  return (
    <StudyDashboard
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      documents={documents}
      flashcardSets={flashcardSets}
    />
  );
}
