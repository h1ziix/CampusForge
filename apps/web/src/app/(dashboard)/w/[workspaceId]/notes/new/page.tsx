import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { NoteEditor } from '@/components/note/note-editor';
import { createNoteAction } from '@/server/actions/note';

export const metadata: Metadata = {
  title: 'New Note',
};

/**
 * CampusForge new note page — workspace-scoped.
 * Renders the note editor in create mode.
 */
export default async function NewNotePage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  return <CreateNotePageClient workspaceId={params.workspaceId} />;
}

/**
 * Client wrapper to pass the server action as a callback to NoteEditor.
 * This pattern avoids passing server actions as serialized props directly.
 */
function CreateNotePageClient({ workspaceId }: { workspaceId: string }) {
  async function handleSave(formData: FormData) {
    'use server';
    const result = await createNoteAction(formData);
    if (result.success) {
      return { success: true, noteId: result.data.noteId };
    }
    return { success: false, error: result.error };
  }

  return (
    <NoteEditor
      mode="create"
      workspaceId={workspaceId}
      onSave={handleSave}
      backHref={`/w/${workspaceId}/notes`}
    />
  );
}
