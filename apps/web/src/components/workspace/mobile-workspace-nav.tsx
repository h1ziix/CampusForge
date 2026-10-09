'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SidebarWorkspaceNav } from '@/components/workspace/sidebar-workspace-nav';
import type { WorkspaceItem } from '@/components/workspace/workspace-switcher';

export function MobileWorkspaceNav({ workspaces }: { workspaces: WorkspaceItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <div className="md:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open workspace menu">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            if (window.matchMedia('(min-width: 768px)').matches) {
              // The mobile trigger is hidden after a breakpoint change. Continue
              // at the equivalent desktop control instead of losing keyboard focus.
              event.preventDefault();
              document
                .querySelector<HTMLButtonElement>('aside button[aria-haspopup="menu"]')
                ?.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Workspace menu</DialogTitle>
            <DialogDescription>Switch workspace or open your study materials.</DialogDescription>
          </DialogHeader>
          <SidebarWorkspaceNav workspaces={workspaces} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
