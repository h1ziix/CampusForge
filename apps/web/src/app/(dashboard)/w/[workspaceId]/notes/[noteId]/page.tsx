import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getNoteById } from '@/server/queries/note';
import { NoteDetail } from '@/components/note/note-detail';
import { NoteEditor } from '@/components/note/note-editor';
import { updateNoteAction } from '@/server/actions/note';

export const metadata: Metadata = {
  title: 'Note',
};

/**
 * CampusForge note detail/edit page — workspace-scoped.
 *
 * ?edit=true — renders the editor in edit mode.
 * Otherwise — renders the read-only detail view.
 */
export default async function NoteDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ workspaceId: string; noteId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const note = await getNoteById(params.noteId, params.workspaceId);
  if (!note) notFound();

  const isEditing = searchParams.edit === 'true';

  if (isEditing) {
    return (
      <EditNotePageClient
        workspaceId={params.workspaceId}
        noteId={note.id}
        title={note.title}
        content={note.content}
      />
    );
  }

  return <NoteDetail note={note} workspaceId={params.workspaceId} />;
}

/**
 * Client wrapper for the edit flow.
 * Passes the server action as a callback to NoteEditor.
 */
function EditNotePageClient({
  workspaceId,
  noteId,
  title,
  content,
}: {
  workspaceId: string;
  noteId: string;
  title: string;
  content: string;
}) {
  async function handleSave(formData: FormData) {
    'use server';
    const result = await updateNoteAction(formData);
    if (result.success) {
      return { success: true, noteId: result.data.noteId };
    }
    return { success: false, error: result.error };
  }

  return (
    <NoteEditor
      mode="edit"
      workspaceId={workspaceId}
      noteId={noteId}
      defaultTitle={title}
      defaultContent={content}
      onSave={handleSave}
      backHref={`/w/${workspaceId}/notes/${noteId}`}
    />
  );
}
