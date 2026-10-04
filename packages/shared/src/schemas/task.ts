import { z } from 'zod';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  status: z.enum(TASK_STATUSES).default('TODO'),
  dueDate: z.coerce.date().optional(),
  assigneeId: z.string().cuid().optional(),
  workspaceId: z.string().cuid(),
});

export const updateTaskSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  assigneeId: z.string().cuid().optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
