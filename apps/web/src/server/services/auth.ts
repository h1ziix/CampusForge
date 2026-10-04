import bcrypt from 'bcryptjs';
import { prisma } from '@campusforge/db';
import { signUpSchema, strictBcryptPasswordHash, type SignUpInput } from '@campusforge/shared';
import { enforcePasswordBudget } from '@/lib/auth-rate-limit';

const SALT_ROUNDS = 12;

type CreateUserResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Create a new CampusForge user with a hashed password
 * and a default personal workspace.
 *
 * Uses an explicit transaction to guarantee that every user
 * always has at least one workspace with an OWNER membership.
 *
 * Called by the sign-up server action only.
 */
export async function createUser(
  input: SignUpInput,
  requestHeaders: Pick<Headers, 'get'>,
): Promise<CreateUserResult> {
  await enforcePasswordBudget('signup', input.email, requestHeaders);
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  const email = input.email.toLowerCase().trim();

  // Check for existing user before doing expensive bcrypt work
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  // Identical public outcome and bcrypt work for an existing and a new account.
  const passwordHash = strictBcryptPasswordHash(await bcrypt.hash(input.password, SALT_ROUNDS));
  if (existing) return { ok: true, email };

  // Transaction: create user + workspace + membership atomically
  try {
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
        },
        select: { id: true, email: true, name: true },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: 'My Workspace',
          type: 'PERSONAL',
          ownerId: newUser.id,
        },
      });

      await tx.membership.create({
        data: {
          userId: newUser.id,
          workspaceId: workspace.id,
          role: 'OWNER',
        },
      });

      return newUser;
    });
  } catch (error) {
    // A racing duplicate signup must have the same public result.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002'))
      throw error;
  }
  return { ok: true, email };
}
