'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskForm, type TaskFormValues } from '@/components/task/task-form';
import { createTaskAction } from '@/server/actions/task';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  members: { id: string; name: string | null; email: string }[];
}

/**
 * CampusForge create task dialog.
 * Opens from the task list page. Creates a new task and refreshes the page.
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  workspaceId,
  members,
}: CreateTaskDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(values: TaskFormValues) {
    setError(null);

    const formData = new FormData();
    formData.set('title', values.title);
    formData.set('description', values.description ?? '');
    formData.set('priority', values.priority);
    formData.set('status', values.status);
    formData.set('workspaceId', workspaceId);
    if (values.dueDate) formData.set('dueDate', values.dueDate);
    if (values.assigneeId) formData.set('assigneeId', values.assigneeId);

    startTransition(async () => {
      const result = await createTaskAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Add a new task to this workspace.</DialogDescription>
        </DialogHeader>
        <TaskForm
          mode="create"
          members={members}
          error={error}
          isPending={isPending}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
