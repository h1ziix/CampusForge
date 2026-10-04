import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getWorkspaceDocuments } from '@/server/queries/document';
import { DocumentList } from '@/components/document/document-list';

export const metadata: Metadata = {
  title: 'Documents',
};

/**
 * CampusForge document list page — workspace-scoped.
 *
 * Server component that fetches all documents for the workspace,
 * then passes them to the client-side DocumentList component.
 * The DocumentList handles upload dialog and delete interactions.
 */
export default async function DocumentsPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const documents = await getWorkspaceDocuments(params.workspaceId);

  return (
    <div className="space-y-6">
      <DocumentList documents={documents} workspaceId={params.workspaceId} />
    </div>
  );
}
