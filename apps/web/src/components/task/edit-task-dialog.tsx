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
import { updateTaskAction } from '@/server/actions/task';
import type { TaskRow } from '@/server/queries/task';

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRow;
  workspaceId: string;
  members: { id: string; name: string | null; email: string }[];
}

/**
 * CampusForge edit task dialog.
 * Opens when clicking a task row. Updates the task and refreshes the page.
 */
export function EditTaskDialog({
  open,
  onOpenChange,
  task,
  workspaceId,
  members,
}: EditTaskDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(values: TaskFormValues) {
    setError(null);

    const formData = new FormData();
    formData.set('id', task.id);
    formData.set('workspaceId', workspaceId);
    formData.set('title', values.title);
    formData.set('description', values.description ?? '');
    formData.set('priority', values.priority);
    formData.set('status', values.status);
    if (values.dueDate) {
      formData.set('dueDate', values.dueDate);
    } else {
      formData.set('dueDate', '');
    }
    if (values.assigneeId) {
      formData.set('assigneeId', values.assigneeId);
    } else {
      formData.set('assigneeId', '');
    }

    startTransition(async () => {
      const result = await updateTaskAction(formData);

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
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Update the task details.</DialogDescription>
        </DialogHeader>
        <TaskForm
          mode="edit"
          members={members}
          error={error}
          isPending={isPending}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          defaultValues={{
            title: task.title,
            description: task.description ?? '',
            priority: task.priority,
            status: task.status,
            dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
            assigneeId: task.assigneeId ?? '',
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
