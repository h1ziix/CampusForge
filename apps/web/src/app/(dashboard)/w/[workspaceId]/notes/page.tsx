import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getWorkspaceNotes } from '@/server/queries/note';
import { NoteList } from '@/components/note/note-list';

export const metadata: Metadata = {
  title: 'Notes',
};

/**
 * CampusForge notes list page — workspace-scoped.
 * Server component that fetches all notes for the workspace
 * and renders them in a card grid.
 */
export default async function NotesPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const notes = await getWorkspaceNotes(params.workspaceId);

  return (
    <div className="space-y-6">
      <NoteList notes={notes} workspaceId={params.workspaceId} />
    </div>
  );
}
