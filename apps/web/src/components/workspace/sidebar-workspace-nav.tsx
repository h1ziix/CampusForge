'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { WorkspaceSwitcher, type WorkspaceItem } from '@/components/workspace/workspace-switcher';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';

interface SidebarWorkspaceNavProps {
  workspaces: WorkspaceItem[];
}

/**
 * Extracts the workspace ID from a /w/[workspaceId]/... URL path.
 * Returns null if not on a workspace-scoped route.
 */
function extractWorkspaceId(pathname: string): string | null {
  const match = pathname.match(/^\/w\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Client wrapper for the workspace switcher + create dialog + nav links.
 * Used inside the AppShell sidebar. Derives current workspace from URL.
 */
export function SidebarWorkspaceNav({ workspaces }: SidebarWorkspaceNavProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const currentWorkspaceId = extractWorkspaceId(pathname) ?? workspaces[0]?.id ?? '';

  return (
    <>
      <WorkspaceSwitcher
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        currentPathname={pathname}
        onCreateClick={() => setCreateOpen(true)}
      />
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Workspace-scoped nav links */}
      {currentWorkspaceId && (
        <nav className="mt-3 space-y-1">
          <a
            href={`/w/${currentWorkspaceId}/dashboard`}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname === `/w/${currentWorkspaceId}/dashboard`
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Dashboard
          </a>
          <a
            href={`/w/${currentWorkspaceId}/assistant`}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname.startsWith(`/w/${currentWorkspaceId}/assistant`)
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            AI Assistant
          </a>
          <a
            href={`/w/${currentWorkspaceId}/tasks`}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname === `/w/${currentWorkspaceId}/tasks`
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tasks
          </a>
          <a
            href={`/w/${currentWorkspaceId}/notes`}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname.startsWith(`/w/${currentWorkspaceId}/notes`)
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Notes
          </a>
          <a
            href={`/w/${currentWorkspaceId}/documents`}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname.startsWith(`/w/${currentWorkspaceId}/documents`)
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Documents
          </a>
          <a
            href={`/w/${currentWorkspaceId}/flashcards`}
            className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-background hover:shadow-sm ${
              pathname.startsWith(`/w/${currentWorkspaceId}/flashcards`)
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Flashcards
          </a>
        </nav>
      )}
    </>
  );
}
