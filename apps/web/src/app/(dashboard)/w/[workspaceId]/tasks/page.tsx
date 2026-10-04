import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getWorkspaceTasks, getWorkspaceMembers } from '@/server/queries/task';
import { TaskList } from '@/components/task/task-list';

export const metadata: Metadata = {
  title: 'Tasks',
};

/**
 * CampusForge task list page — workspace-scoped.
 *
 * Server component that fetches all tasks and workspace members,
 * then passes them to the client-side TaskList component.
 * The TaskList handles create/edit dialogs and UI interactions.
 */
export default async function TasksPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  // Verify workspace membership (throws if not a member)
  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const [tasks, members] = await Promise.all([
    getWorkspaceTasks(params.workspaceId),
    getWorkspaceMembers(params.workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <TaskList tasks={tasks} workspaceId={params.workspaceId} members={members} />
    </div>
  );
}
