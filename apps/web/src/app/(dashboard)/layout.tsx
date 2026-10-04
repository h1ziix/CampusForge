import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserWorkspaces } from '@/server/queries/workspace';
import { AppShell } from '@/components/layout/app-shell';

/**
 * CampusForge authenticated layout.
 *
 * Fetches the session and user workspaces server-side.
 * Passes user data + workspace list to AppShell.
 *
 * This layout wraps both:
 * - /dashboard (redirect page)
 * - /w/[workspaceId]/* (workspace-scoped pages)
 *
 * The current workspace ID is derived client-side from the URL
 * inside SidebarWorkspaceNav.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Defense-in-depth: middleware should already redirect, but just in case
  if (typeof session?.user?.id !== 'string' || !session.user.id) {
    redirect('/sign-in');
  }

  const workspaces = await getUserWorkspaces(session.user.id);

  // Serialize workspace list for the client-side switcher
  const workspaceItems = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    type: ws.type,
    role: ws.role,
  }));

  return (
    <AppShell user={session.user} workspaces={workspaceItems}>
      {children}
    </AppShell>
  );
}
