import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getWorkspaceForUser } from '@/server/queries/workspace';
import { WorkspaceProvider } from '@/lib/workspace-context';

/**
 * CampusForge workspace-scoped layout.
 *
 * Validates that:
 * 1. The user is authenticated (defense-in-depth, middleware should catch this)
 * 2. The workspace exists
 * 3. The user is a member of this workspace
 *
 * If any check fails, renders 404. This prevents unauthorized workspace access.
 * Provides WorkspaceContext to all child pages/components.
 */
export default async function WorkspaceLayout({
  children,
  params: paramsPromise,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();

  if (!session?.user?.id) {
    notFound();
  }

  const workspace = await getWorkspaceForUser(params.workspaceId, session.user.id);

  if (!workspace) {
    notFound();
  }

  return (
    <WorkspaceProvider
      workspace={{
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        role: workspace.role,
        memberCount: workspace.memberCount,
        taskCount: workspace.taskCount,
        noteCount: workspace.noteCount,
        documentCount: workspace.documentCount,
      }}
    >
      {children}
    </WorkspaceProvider>
  );
}
