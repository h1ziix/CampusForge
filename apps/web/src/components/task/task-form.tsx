'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from '@campusforge/shared';

export interface TaskFormValues {
  title: string;
  description: string;
  priority: string;
  status: string;
  dueDate: string;
  assigneeId: string;
}

interface TaskFormProps {
  mode: 'create' | 'edit';
  members: { id: string; name: string | null; email: string }[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel: () => void;
  defaultValues?: Partial<TaskFormValues>;
}

/**
 * Shared task form used by both the create and edit dialogs.
 * Keeps all form field logic in one place — no duplication.
 */
export function TaskForm({
  mode,
  members,
  error,
  isPending,
  onSubmit,
  onCancel,
  defaultValues,
}: TaskFormProps) {
  const [title, setTitle] = useState(defaultValues?.title ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [priority, setPriority] = useState(defaultValues?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState(defaultValues?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(defaultValues?.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState(defaultValues?.assigneeId ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ title, description, priority, status, dueDate, assigneeId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 py-2">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Review chapter 5 notes"
            required
            maxLength={200}
            disabled={isPending}
            autoComplete="off"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="task-desc">Description (optional)</Label>
          <textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details..."
            maxLength={5000}
            disabled={isPending}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Priority + Status row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority</Label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-status">Status</Label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due date */}
        <div className="space-y-2">
          <Label htmlFor="task-due">Due date (optional)</Label>
          <Input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Assignee */}
        {members.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="task-assignee">Assignee (optional)</Label>
            <select
              id="task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !title.trim()}>
          {isPending
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Task'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
