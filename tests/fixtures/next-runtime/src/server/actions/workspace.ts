'use server';

import type { ActionResult } from '@campusforge/shared';

export async function createWorkspaceAction(
  formData: FormData,
): Promise<ActionResult<{ workspaceId: string }>> {
  void formData;
  return { success: false, error: 'R1 synthetic fixture: no mutation was performed' };
}
