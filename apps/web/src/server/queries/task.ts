import { prisma } from '@campusforge/db';

/**
 * Serializable task shape returned from queries.
 * Dates are converted to ISO strings for safe server→client transfer.
 */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all tasks for a workspace, newest first.
 * Includes assignee name for display.
 */
export async function getWorkspaceTasks(workspaceId: string): Promise<TaskRow[]> {
  const tasks = await prisma.task.findMany({
    where: { workspaceId },
    include: {
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

/**
 * Get a single task by ID within a workspace.
 * Returns null if not found or doesn't belong to the workspace.
 */
export async function getTaskById(taskId: string, workspaceId: string): Promise<TaskRow | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  });

  if (!task) return null;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * Get task counts grouped by status for a workspace.
 * Used on the workspace dashboard.
 */
export async function getTaskStatusCounts(workspaceId: string): Promise<Record<string, number>> {
  const groups = await prisma.task.groupBy({
    by: ['status'],
    where: { workspaceId },
    _count: { status: true },
  });

  const counts: Record<string, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    CANCELLED: 0,
  };

  for (const g of groups) {
    counts[g.status] = g._count.status;
  }

  return counts;
}

/**
 * Get the upcoming tasks (not done/cancelled, ordered by due date).
 * Limited to `limit` results. Used on the dashboard.
 */
export async function getUpcomingTasks(workspaceId: string, limit = 5): Promise<TaskRow[]> {
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      status: { in: ['TODO', 'IN_PROGRESS'] },
    },
    include: {
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: limit,
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

/**
 * Get workspace members for the assignee picker.
 */
export async function getWorkspaceMembers(workspaceId: string) {
  const memberships = await prisma.membership.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
  }));
}
