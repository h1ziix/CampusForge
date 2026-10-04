import { prisma } from '@campusforge/db';
import type { CreateTaskInput, UpdateTaskInput } from '@campusforge/shared';

type TaskResult = { ok: true; taskId: string } | { ok: false; error: string };

/**
 * Create a new task in a CampusForge workspace.
 *
 * If an assigneeId is provided, validates that the assignee
 * is a member of the workspace before creating.
 */
export async function createTask(input: CreateTaskInput): Promise<TaskResult> {
  // Validate assignee membership if provided
  if (input.assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: input.assigneeId,
          workspaceId: input.workspaceId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      return { ok: false, error: 'Assignee is not a member of this workspace' };
    }
  }

  const task = await prisma.task.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'TODO',
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? null,
      workspaceId: input.workspaceId,
    },
    select: { id: true },
  });

  return { ok: true, taskId: task.id };
}

/**
 * Update an existing task.
 *
 * Verifies the task belongs to the given workspace.
 * Only updates fields that are explicitly provided.
 * If assigneeId is set to null, clears the assignment.
 */
export async function updateTask(input: UpdateTaskInput, workspaceId: string): Promise<TaskResult> {
  // Verify task belongs to this workspace
  const existing = await prisma.task.findFirst({
    where: { id: input.id, workspaceId },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false, error: 'Task not found' };
  }

  // Validate assignee membership if changing assignment
  if (input.assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: input.assigneeId,
          workspaceId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      return { ok: false, error: 'Assignee is not a member of this workspace' };
    }
  }

  // Build update data — only include fields that were explicitly passed
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.status !== undefined) data.status = input.status;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;

  await prisma.task.update({
    where: { id: input.id },
    data,
  });

  return { ok: true, taskId: input.id };
}
