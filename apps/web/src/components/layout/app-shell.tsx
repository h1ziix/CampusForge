import { User } from 'lucide-react';
import { APP_NAME } from '@campusforge/shared';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { SidebarWorkspaceNav } from '@/components/workspace/sidebar-workspace-nav';
import { MobileWorkspaceNav } from '@/components/workspace/mobile-workspace-nav';
import type { WorkspaceItem } from '@/components/workspace/workspace-switcher';
import { AuthenticatedPrivacyBoundary } from '@/components/auth/authenticated-privacy-boundary';

interface AppShellProps {
  children: React.ReactNode;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  workspaces: WorkspaceItem[];
}

/**
 * CampusForge app shell. Renders the sidebar, header, and content area.
 * Server component — user data and workspaces are passed as props from the layout.
 * The workspace switcher and nav links are client components inside SidebarWorkspaceNav.
 */
export function AppShell({ children, user, workspaces }: AppShellProps) {
  return (
    <AuthenticatedPrivacyBoundary userId={user.id}>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r bg-muted/35 dark:bg-background/45 md:block">
          <div className="flex h-16 items-center px-6">
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </div>
          <Separator />

          {/* Workspace switcher + nav links (client component) */}
          <div className="px-3 py-3">
            <SidebarWorkspaceNav workspaces={workspaces} />
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
            <div className="flex min-w-0 items-center gap-1 md:hidden">
              <MobileWorkspaceNav workspaces={workspaces} />
              <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
            </div>
            <div className="hidden md:block" />
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <div className="hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm shadow-sm sm:flex">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{user.name || user.email}</span>
              </div>
              <ThemeToggle />
              <SignOutButton />
            </div>
          </header>

          {/* Page content */}
          <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </AuthenticatedPrivacyBoundary>
  );
}
