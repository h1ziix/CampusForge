import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserWorkspaces } from '@/server/queries/workspace';

/**
 * Bare /dashboard redirect.
 *
 * When a user navigates to /dashboard (no workspace ID),
 * this page looks up their first workspace and redirects
 * to /w/[workspaceId]/dashboard.
 *
 * If the user has no workspaces (shouldn't happen — sign-up creates one),
 * they stay here with a fallback message.
 */
export default async function DashboardRedirectPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/sign-in');
  }

  const workspaces = await getUserWorkspaces(session.user.id);

  if (workspaces.length > 0) {
    redirect(`/w/${workspaces[0].id}/dashboard`);
  }

  // Fallback: no workspaces (should not happen for normal users)
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">No workspaces found</h1>
        <p className="mt-2 text-muted-foreground">Something went wrong. Please contact support.</p>
      </div>
    </div>
  );
}
