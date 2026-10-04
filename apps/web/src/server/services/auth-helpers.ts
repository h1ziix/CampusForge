import { auth } from '@/lib/auth';
import { prisma } from '@campusforge/db';

/**
 * Require an authenticated session. Call this at the top of every
 * server action and query that needs a logged-in user.
 *
 * Returns the session user with id, email, name, role, onboardingCompleted.
 * Throws if not authenticated (caught by error boundaries or action wrappers).
 */
export async function requireAuth() {
  const session = await auth();

  if (typeof session?.user?.id !== 'string' || session.user.id.length === 0) {
    throw new Error('Not authenticated');
  }

  return session.user;
}

/**
 * Require that the authenticated user is a member of the given workspace.
 * Returns the membership record with the user's role in that workspace.
 *
 * Call this in every server action that operates on workspace-scoped data.
 */
export async function requireWorkspaceMember(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new Error('Not a member of this workspace');
  }

  return membership;
}
