'use client';

import { useState, useTransition } from 'react';
import { ChevronsUpDown, Plus, Check, Users, BookOpen, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
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
}

const typeIcons: Record<string, typeof Users> = {
  PERSONAL: UserIcon,
  TEAM: Users,
  RESEARCH: BookOpen,
};

/**
 * CampusForge workspace switcher dropdown.
 * Appears in the sidebar. Lists all workspaces the user belongs to.
 * Clicking a workspace navigates to /w/[id]/dashboard.
 */
export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  currentPathname,
  onCreateClick,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  function handleSelect(workspaceId: string) {
    setOpen(false);
    if (workspaceId === currentWorkspaceId) return;

    // Replace the workspace ID segment in the URL.
    // Current: /w/[old]/dashboard  ->  /w/[new]/dashboard
    const pathname =
      currentPathname || (typeof window !== 'undefined' ? window.location.pathname : '/dashboard');
    const newPath = pathname.replace(/\/w\/[^/]+/, `/w/${workspaceId}`);

    startTransition(() => {
      window.location.assign(newPath);
    });
  }

  const CurrentIcon = current ? (typeIcons[current.type] ?? UserIcon) : UserIcon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between gap-2 rounded-lg px-3 py-2"
          disabled={isPending}
        >
          <div className="flex items-center gap-2 truncate">
            <CurrentIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">
              {current?.name ?? 'Select workspace'}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-xl p-1.5" align="start" side="bottom">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => {
          const Icon = typeIcons[ws.type] ?? UserIcon;
          const isActive = ws.id === currentWorkspaceId;
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSelect(ws.id)}
              className="flex items-center gap-2 rounded-lg"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-col truncate">
                <span className="truncate text-sm">{ws.name}</span>
                <span className="text-xs text-muted-foreground">
                  {WORKSPACE_TYPE_LABELS[ws.type] ?? ws.type}
                </span>
              </div>
              {isActive && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false);
            onCreateClick();
          }}
          className="flex items-center gap-2 rounded-lg"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span>Create Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
