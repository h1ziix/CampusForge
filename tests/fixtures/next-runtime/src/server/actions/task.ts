'use server';

import type { ActionResult } from '@campusforge/shared';

export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  if (formData.get('title') !== 'R1 deferred action regression') {
    throw new Error('The fixture only accepts its synthetic regression input');
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return { success: false, error: 'R1 synthetic action error: no mutation was performed' };
}
