import { z } from 'zod';

export const WORKSPACE_TYPES = ['PERSONAL', 'TEAM', 'RESEARCH'] as const;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
  type: z.enum(WORKSPACE_TYPES),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
