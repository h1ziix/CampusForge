import { prisma } from '@campusforge/db';

/**
 * Get all workspaces the user is a member of.
 * Returns workspace data + the user's role in each.
 * Sorted: personal first, then by name.
 */
export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          createdAt: true,
          _count: {
            select: { memberships: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    ...m.workspace,
    memberCount: m.workspace._count.memberships,
    role: m.role,
  }));
}

/**
 * Get a single workspace by ID + verify the user is a member.
 * Returns null if workspace doesn't exist or user has no access.
 */
export async function getWorkspaceForUser(workspaceId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          createdAt: true,
          _count: {
            select: { memberships: true, tasks: true, notes: true, documents: true },
          },
        },
      },
    },
  });

  if (!membership) return null;

  return {
    ...membership.workspace,
    memberCount: membership.workspace._count.memberships,
    taskCount: membership.workspace._count.tasks,
    noteCount: membership.workspace._count.notes,
    documentCount: membership.workspace._count.documents,
    role: membership.role,
  };
}
