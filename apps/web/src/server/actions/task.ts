'use server';

import { createTaskSchema, updateTaskSchema } from '@campusforge/shared';
import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth, requireWorkspaceMember } from '@/server/services/auth-helpers';
import { createTask, updateTask } from '@/server/services/task';

/**
 * Create a task in a CampusForge workspace.
 *
 * 1. Validate input with Zod
 * 2. Check auth
 * 3. Check workspace membership
 * 4. Call createTask service
 * 5. Return the new task ID
 */
export async function createTaskAction(
  formData: FormData,
): Promise<ActionResult<{ taskId: string }>> {
  const user = await requireAuth();

  const raw: Record<string, unknown> = {
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    priority: formData.get('priority') || 'MEDIUM',
    status: formData.get('status') || 'TODO',
    workspaceId: formData.get('workspaceId'),
  };

  // Due date: only include if non-empty
  const dueDateStr = formData.get('dueDate');
  if (dueDateStr && typeof dueDateStr === 'string' && dueDateStr.length > 0) {
    raw.dueDate = dueDateStr;
  }

  // Assignee: only include if non-empty
  const assigneeId = formData.get('assigneeId');
  if (assigneeId && typeof assigneeId === 'string' && assigneeId.length > 0) {
    raw.assigneeId = assigneeId;
  }

  const parsed = createTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  await requireWorkspaceMember(user.id, parsed.data.workspaceId);

  try {
    const result = await createTask(parsed.data);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ taskId: result.taskId });
  } catch (error) {
    console.error('[CampusForge] Create task error:', error);
    return err('Failed to create task. Please try again.');
  }
}

/**
 * Update an existing task in a CampusForge workspace.
 *
 * 1. Validate input with Zod
 * 2. Check auth
 * 3. Check workspace membership
 * 4. Call updateTask service
 */
export async function updateTaskAction(
  formData: FormData,
): Promise<ActionResult<{ taskId: string }>> {
  const user = await requireAuth();

  const workspaceId = formData.get('workspaceId');
  if (!workspaceId || typeof workspaceId !== 'string') {
    return err('Workspace ID is required');
  }

  const raw: Record<string, unknown> = {
    id: formData.get('id'),
  };

  // Only include fields that the form actually sent
  const title = formData.get('title');
  if (title !== null) raw.title = title;

  const description = formData.get('description');
  if (description !== null) raw.description = description || null;

  const priority = formData.get('priority');
  if (priority !== null) raw.priority = priority;

  const status = formData.get('status');
  if (status !== null) raw.status = status;

  const dueDateStr = formData.get('dueDate');
  if (dueDateStr !== null) {
    raw.dueDate =
      dueDateStr && typeof dueDateStr === 'string' && dueDateStr.length > 0 ? dueDateStr : null;
  }

  const assigneeId = formData.get('assigneeId');
  if (assigneeId !== null) {
    raw.assigneeId =
      assigneeId && typeof assigneeId === 'string' && assigneeId.length > 0 ? assigneeId : null;
  }

  const parsed = updateTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  await requireWorkspaceMember(user.id, workspaceId);

  try {
    const result = await updateTask(parsed.data, workspaceId);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ taskId: result.taskId });
  } catch (error) {
    console.error('[CampusForge] Update task error:', error);
    return err('Failed to update task. Please try again.');
  }
}
