'use client';

import { useState, useTransition, type Ref } from 'react';
import { ChevronsUpDown, Plus, Check, Users, BookOpen, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WORKSPACE_TYPE_LABELS } from '@campusforge/shared';

export interface WorkspaceItem {
  id: string;
  name: string;
  type: string;
  role: string;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceItem[];
  currentWorkspaceId: string;
  currentPathname: string;
  onCreateClick: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

const typeIcons: Record<string, typeof Users> = {
  PERSONAL: UserIcon,
  TEAM: Users,
  RESEARCH: BookOpen,
};

/**
 * CampusForge workspace switcher dropdown.
 * Appears in the sidebar. Lists all workspaces the user belongs to.
 * Keeps the current section when switching, dropping IDs owned by the old workspace.
 */
export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  currentPathname,
  onCreateClick,
  triggerRef,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  function handleSelect(workspaceId: string) {
    setOpen(false);
    if (workspaceId === currentWorkspaceId) return;

    const pathname =
      currentPathname || (typeof window !== 'undefined' ? window.location.pathname : '/dashboard');
    const section = pathname.match(/^\/w\/[^/]+\/([^/]+)/)?.[1] ?? 'dashboard';
    const destinationSection = ['dashboard', 'documents', 'flashcards', 'tasks', 'notes'].includes(
      section,
    )
      ? section
      : 'dashboard';
    // A document/card/task ID belongs to its original workspace. The new workspace
    // opens the section's collection instead of requesting a foreign resource.
    const newPath = `/w/${encodeURIComponent(workspaceId)}/${destinationSection}`;

    startTransition(() => {
      // Keep the established full navigation at this workspace boundary so
      // components cannot carry the previous workspace's in-memory state forward.
      window.location.assign(new URL(newPath, window.location.origin));
    });
  }

  const CurrentIcon = current ? (typeIcons[current.type] ?? UserIcon) : UserIcon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          className="h-auto w-full min-w-0 justify-between gap-2 rounded-lg px-3 py-2"
          aria-label={`Switch workspace: ${current?.name ?? 'Select workspace'}`}
          title={current?.name}
          disabled={isPending}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CurrentIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-medium">
              {current?.name ?? 'Select workspace'}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-64 min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-1.5"
        align="start"
        side="bottom"
        collisionPadding={8}
      >
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {workspaces.map((ws) => {
            const Icon = typeIcons[ws.type] ?? UserIcon;
            const isActive = ws.id === currentWorkspaceId;
            return (
              <DropdownMenuItem
                key={ws.id}
                onSelect={() => handleSelect(ws.id)}
                aria-current={isActive ? 'true' : undefined}
                title={ws.name}
                className="flex min-w-0 items-center gap-2 rounded-lg"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{ws.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {WORKSPACE_TYPE_LABELS[ws.type] ?? ws.type}
                  </span>
                </div>
                {isActive && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onCreateClick();
            }}
            className="flex items-center gap-2 rounded-lg"
          >
            <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>Create Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
