'use client';

import { useTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createWorkspaceAction } from '@/server/actions/workspace';
import { WORKSPACE_TYPE_LABELS } from '@campusforge/shared';

const WORKSPACE_TYPES = ['PERSONAL', 'TEAM', 'RESEARCH'] as const;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CampusForge create workspace dialog.
 * Opens from the workspace switcher. Creates a new workspace
 * and redirects to its dashboard.
 */
export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('TEAM');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set('type', selectedType);

    startTransition(async () => {
      const result = await createWorkspaceAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      window.location.assign(
        new URL(`/w/${result.data.workspaceId}/dashboard`, window.location.origin),
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to organize your work in CampusForge.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                name="name"
                placeholder="e.g. CS 301 Study Group"
                required
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {WORKSPACE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    disabled={isPending}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selectedType === type
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {WORKSPACE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
