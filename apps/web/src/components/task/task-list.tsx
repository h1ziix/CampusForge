'use client';

import { useState } from 'react';
import { Calendar, CheckCircle2, Circle, Clock, Plus, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskStatusBadge } from '@/components/task/task-status-badge';
import { TaskPriorityBadge } from '@/components/task/task-priority-badge';
import { CreateTaskDialog } from '@/components/task/create-task-dialog';
import { EditTaskDialog } from '@/components/task/edit-task-dialog';
import type { TaskRow } from '@/server/queries/task';

interface TaskListProps {
  tasks: TaskRow[];
  workspaceId: string;
  members: { id: string; name: string | null; email: string }[];
}

/**
 * CampusForge task list with empty state, create button, and edit flow.
 * Client component that manages dialog state for create/edit.
 */
export function TaskList({ tasks, workspaceId, members }: TaskListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            {tasks.length === 0
              ? 'No tasks yet. Create one to get started.'
              : `${tasks.length} task${tasks.length === 1 ? '' : 's'} in this workspace`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No tasks yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Tasks help you track assignments, projects, and deadlines. Create your first task to get
            organized.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create First Task
          </Button>
        </div>
      )}

      {/* Task rows */}
      {tasks.length > 0 && (
        <div className="mt-6 space-y-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setEditingTask(task)}
              className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50"
            >
              {/* Status icon */}
              <div className="shrink-0">
                {task.status === 'DONE' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : task.status === 'IN_PROGRESS' ? (
                  <Clock className="h-5 w-5 text-blue-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              {/* Title + description */}
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium ${task.status === 'DONE' || task.status === 'CANCELLED' ? 'text-muted-foreground line-through' : ''}`}
                >
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {task.description}
                  </p>
                )}
              </div>

              {/* Badges + meta */}
              <div className="flex shrink-0 items-center gap-2">
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
                {task.dueDate && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        members={members}
      />

      {editingTask && (
        <EditTaskDialog
          open={!!editingTask}
          onOpenChange={(open) => {
            if (!open) setEditingTask(null);
          }}
          task={editingTask}
          workspaceId={workspaceId}
          members={members}
        />
      )}
    </div>
  );
}

/**
 * Loading skeleton for the task list.
 * Shown while server data is loading.
 */
export function TaskListSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-2 h-5 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
