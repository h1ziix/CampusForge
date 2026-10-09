import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getDocumentGenerationState } from '@/server/queries/document-state';
import { DocumentDetailView } from '@/components/document/document-detail-view';

export const metadata: Metadata = {
  title: 'Document',
};

/**
 * CampusForge document detail page — shows document info,
 * summary generation trigger, flashcard generation trigger,
 * and summary/flashcard display.
 */
export default async function DocumentDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (typeof session?.user?.id !== 'string' || !session.user.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const state = await getDocumentGenerationState(params.documentId, params.workspaceId);
  if (!state) notFound();

  return (
    <div className="space-y-6">
      <DocumentDetailView
        {...state}
        workspaceId={params.workspaceId}
        identity={{ userId: session.user.id, workspaceId: params.workspaceId }}
      />
    </div>
  );
}
