import { prisma } from '@campusforge/db';
import type { CreateWorkspaceInput } from '@campusforge/shared';

type CreateWorkspaceResult =
  | { ok: true; workspace: { id: string; name: string; type: string } }
  | { ok: false; error: string };

/**
 * Create a new CampusForge workspace with the given user as OWNER.
 *
 * Uses a transaction to atomically create the workspace and
 * the OWNER membership record.
 */
export async function createWorkspace(
  input: CreateWorkspaceInput,
  userId: string,
): Promise<CreateWorkspaceResult> {
  const name = input.name.trim();

  if (!name) {
    return { ok: false, error: 'Workspace name is required' };
  }

  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name,
        type: input.type,
        ownerId: userId,
      },
      select: { id: true, name: true, type: true },
    });

    await tx.membership.create({
      data: {
        userId,
        workspaceId: ws.id,
        role: 'OWNER',
      },
    });

    return ws;
  });

  return { ok: true, workspace };
}
