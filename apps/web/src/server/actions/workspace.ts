'use server';

import { createWorkspaceSchema } from '@campusforge/shared';
import { ok, err, type ActionResult } from '@campusforge/shared';
import { requireAuth } from '@/server/services/auth-helpers';
import { createWorkspace } from '@/server/services/workspace';

/**
 * Create a new CampusForge workspace.
 *
 * 1. Validate input with Zod
 * 2. Check auth
 * 3. Call createWorkspace service
 * 4. Return the new workspace ID for redirect
 */
export async function createWorkspaceAction(
  formData: FormData,
): Promise<ActionResult<{ workspaceId: string }>> {
  const user = await requireAuth();

  const raw = {
    name: formData.get('name'),
    type: formData.get('type'),
  };

  const parsed = createWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  try {
    const result = await createWorkspace(parsed.data, user.id);

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ workspaceId: result.workspace.id });
  } catch (error) {
    console.error('[CampusForge] Create workspace error:', error);
    return err('Failed to create workspace. Please try again.');
  }
}
