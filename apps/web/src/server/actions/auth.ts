'use server';

import { signUpSchema, signInSchema, onboardingSchema } from '@campusforge/shared';
import { ok, err, type ActionResult } from '@campusforge/shared';
import { createUser } from '@/server/services/auth';
import { signIn } from '@/lib/auth';
import { requireAuth } from '@/server/services/auth-helpers';
import { prisma } from '@campusforge/db';
import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { PasswordBudgetError, passwordBudgetMessage } from '@/lib/auth-rate-limit';
import { PasswordRequestRejected } from '@/lib/auth-errors';

/**
 * Sign up a new CampusForge user.
 *
 * 1. Validate input with Zod
 * 2. Call createUser service (hashes password, creates workspace)
 * 3. Return success or structured error
 *
 * Does NOT auto-sign-in. The user is redirected to sign-in after sign-up.
 * This is intentional: it confirms the account works and keeps the flow simple.
 */
export async function signUpAction(formData: FormData): Promise<ActionResult<{ email: string }>> {
  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  try {
    const result = await createUser(parsed.data, await headers());

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ email: result.email });
  } catch (error) {
    if (error instanceof PasswordBudgetError) return err(passwordBudgetMessage(error));
    console.error('[CampusForge] Sign-up failed');
    return err('Something went wrong. Please try again.');
  }
}

/**
 * Sign in an existing CampusForge user.
 *
 * Delegates to NextAuth's signIn function which calls the
 * credentials provider authorize callback.
 *
 * Returns an error string on failure, or redirects on success.
 */
export async function signInAction(formData: FormData): Promise<ActionResult<void>> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      redirect: false,
      redirectTo: '/dashboard',
    });

    return ok(undefined);
  } catch (error) {
    if (error instanceof PasswordRequestRejected) {
      return err(
        passwordBudgetMessage(
          new PasswordBudgetError(
            error.code === 'rate_limited' ? 'limited' : 'unavailable',
            error.retryAfterSeconds,
          ),
        ),
      );
    }
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        return err('Invalid email or password');
      }
    }
    // Re-throw unexpected errors (like NEXT_REDIRECT which is not an error)
    throw error;
  }
}

/**
 * Complete the CampusForge onboarding flow.
 *
 * Updates the user profile with university, major, graduation year
 * and sets onboardingCompleted to true.
 */
export async function completeOnboardingAction(formData: FormData): Promise<ActionResult<void>> {
  const user = await requireAuth();

  const raw = {
    name: formData.get('name'),
    university: formData.get('university'),
    major: formData.get('major'),
    graduationYear: Number(formData.get('graduationYear')),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name.trim(),
        university: parsed.data.university.trim(),
        major: parsed.data.major.trim(),
        graduationYear: parsed.data.graduationYear,
        onboardingCompleted: true,
      },
    });

    return ok(undefined);
  } catch {
    console.error('[CampusForge] Onboarding failed');
    return err('Failed to save profile. Please try again.');
  }
}
