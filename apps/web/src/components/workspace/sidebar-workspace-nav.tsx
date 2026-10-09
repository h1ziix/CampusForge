'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { WorkspaceSwitcher, type WorkspaceItem } from '@/components/workspace/workspace-switcher';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';

/** Shared navigation for desktop sidebar and mobile workspace menu. */
export function SidebarWorkspaceNav({ workspaces }: { workspaces: WorkspaceItem[] }) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const switcherRef = useRef<HTMLButtonElement>(null);
  const currentWorkspaceId = pathname.match(/^\/w\/([^/]+)/)?.[1] ?? workspaces[0]?.id ?? '';
  const sections = [
    ['dashboard', 'Study workspace'],
    ['documents', 'Documents'],
    ['flashcards', 'Flashcards'],
    ['tasks', 'Tasks'],
    ['notes', 'Notes'],
  ];
  return (
    <>
      <WorkspaceSwitcher
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        currentPathname={pathname}
        onCreateClick={() => setCreateOpen(true)}
        triggerRef={switcherRef}
      />
      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseAutoFocus={(event) => {
          // This dialog opens from a dropdown item rather than a DialogTrigger.
          // Restore the stable workspace control after Escape, Cancel or Close.
          event.preventDefault();
          switcherRef.current?.focus();
        }}
      />
      {currentWorkspaceId && (
        <nav aria-label="Workspace" className="mt-3 space-y-1">
          {sections.map(([segment, label]) => {
            const href = `/w/${currentWorkspaceId}/${segment}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <a
                key={segment}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </a>
            );
          })}
        </nav>
      )}
    </>
  );
}
